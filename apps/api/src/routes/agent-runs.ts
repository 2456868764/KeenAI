import { zValidator } from "@hono/zod-validator";
import {
  type AgentToolExecutionMode,
  buildStructuredAgentPlan,
  classifyToolRisk,
} from "@keenai/agent";
import { llmProviderIdSchema } from "@keenai/llm";
import { DASHBOARD_API_PREFIX } from "@keenai/shared";
import {
  agentApprovalDecisions,
  agentApprovals,
  agentEscalations,
  agentEvalCases,
  agentEvaluationFeedback,
  agentRuns,
  agentToolPolicies,
  customActions,
} from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  appendAgentRunEvent,
  createAgentEscalation,
  getAgentRunTrace,
  loadAgentToolPolicyRules,
  persistAgentContext,
  transitionAgentRun,
} from "../lib/agent-audit-store.js";
import { executeAuditedAgentDraft, loadAgentRun } from "../lib/agent-runtime.js";
import { createAppLlmRegistry } from "../lib/app-llm-registry.js";
import { canAccessBrand } from "../lib/conversations.js";
import { buildCopilotDraftRequest } from "../lib/copilot-context.js";
import { resolveCustomActionSecretFromEnv } from "../lib/custom-action-executor.js";
import { createCustomActionDraftTool } from "../lib/custom-action-tools.js";
import {
  failWorkflowAfterAgentRejection,
  resumeWorkflowAgentApproval,
  resumeWorkflowToolApproval,
} from "../lib/workflow-resume.js";
import { executeGovernedToolCall } from "../lib/workflow-tool-runtime.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppContext, AppVariables } from "../types.js";

const listRunsSchema = z.object({
  status: z
    .enum([
      "created",
      "planning",
      "retrieving",
      "awaiting_approval",
      "acting",
      "observing",
      "completed",
      "escalated",
      "failed",
    ])
    .optional(),
  conversationId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const approvalDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().max(1_000).optional(),
    resume: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "rejected" && !value.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "rejection_reason_required",
      });
    }
  });

const policyBodySchema = z.object({
  brandId: z.string().min(1).nullable().optional(),
  source: z.enum(["custom_action", "mcp", "workflow", "builtin", "*"]),
  toolPattern: z.string().min(1).max(200),
  effect: z.enum(["allow", "require_approval", "deny"]),
  riskLevel: z.enum(["r0", "r1", "r2", "r3", "r4"]),
  argumentConstraints: z.record(z.unknown()).default({}),
  actorRoles: z.array(z.string().min(1).max(64)).max(20).default([]),
  channels: z.array(z.string().min(1).max(64)).max(20).default([]),
  resourcePatterns: z.array(z.string().min(1).max(200)).max(50).default([]),
  requiredApprovals: z.number().int().min(1).max(5).default(1),
  enabled: z.boolean().default(true),
});

const updatePolicyBodySchema = policyBodySchema.partial();
const escalationDecisionSchema = z.object({
  action: z.enum(["acknowledge", "resolve"]),
  assigneeId: z.string().min(1).nullable().optional(),
  assignedTeamId: z.string().min(1).nullable().optional(),
});

const evaluationFeedbackSchema = z
  .object({
    verdict: z.enum(["accepted", "corrected", "rejected"]),
    csatScore: z.number().int().min(1).max(5).optional(),
    correctedResponse: z.string().trim().min(1).max(20_000).optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.verdict === "corrected" && !value.correctedResponse) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctedResponse"],
        message: "corrected_response_required",
      });
    }
  });

const evalCaseSchema = z.object({
  brandId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  instruction: z.string().trim().min(1).max(20_000),
  expectedOutcome: z.string().trim().min(1).max(10_000),
  requiredEvidence: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  enabled: z.boolean().default(true),
});

function canManagePolicies(role: string): boolean {
  return role === "owner" || role === "admin";
}

async function resumeRun(
  ctx: AppContext,
  db: AppVariables["store"]["db"],
  input: { orgId: string; actorId: string; actorRole: string; runId: string },
) {
  const run = await loadAgentRun(db, input.orgId, input.runId);
  if (!run) return null;
  if (!["awaiting_approval", "escalated", "failed"].includes(run.status)) {
    return { runId: run.id, status: run.status, error: "run_not_resumable" };
  }
  if (!run.brandId || !run.conversationId) {
    return { runId: run.id, status: "failed" as const, error: "run_not_resumable" };
  }

  const snapshot = run.inputSnapshot;
  const instruction = typeof snapshot.instruction === "string" ? snapshot.instruction : undefined;
  const subject = typeof snapshot.subject === "string" ? snapshot.subject : undefined;
  const executionMode: AgentToolExecutionMode =
    snapshot.toolExecutionMode === "pre_authorized" || snapshot.toolExecutionMode === "read_only"
      ? snapshot.toolExecutionMode
      : "governed";
  const llm = createAppLlmRegistry(ctx.env);
  const providerId = llmProviderIdSchema.safeParse(run.providerId);
  const provider = providerId.success
    ? (llm.getProvider(providerId.data) ?? llm.resolveDraftProvider())
    : llm.resolveDraftProvider();

  await transitionAgentRun(db, {
    runId: run.id,
    orgId: input.orgId,
    status: "retrieving",
    phase: "retrieve",
    eventType: "run.resumed",
    payload: { actorId: input.actorId },
  });
  const { request, memoryScope, auditContext } = await buildCopilotDraftRequest(db, ctx.env, {
    conversationId: run.conversationId,
    orgId: input.orgId,
    brandId: run.brandId,
    subject,
    instruction,
  });
  const toolFilter = Array.isArray(snapshot.toolFilter)
    ? snapshot.toolFilter.filter((item): item is string => typeof item === "string")
    : [];
  if (toolFilter.length > 0) {
    request.tools = request.tools?.filter((tool) => toolFilter.includes(tool.name));
  }
  if (executionMode === "read_only") {
    request.tools = request.tools?.filter((tool) => classifyToolRisk(tool) === "r0");
  }
  const plan = buildStructuredAgentPlan({
    intent: auditContext.intent,
    subject,
    instruction,
    tools: request.tools,
  });
  const contextSnapshot = await persistAgentContext(db, {
    runId: run.id,
    orgId: input.orgId,
    memoryScope,
    intent: auditContext.intent,
    weights: auditContext.weights,
    sections: auditContext.sections,
    text: auditContext.text,
  });
  const rules = await loadAgentToolPolicyRules(db, {
    orgId: input.orgId,
    brandId: run.brandId,
  });
  return executeAuditedAgentDraft({
    db,
    identity: {
      runId: run.id,
      orgId: input.orgId,
      conversationId: run.conversationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      channel: typeof snapshot.channelType === "string" ? snapshot.channelType : undefined,
      toolBudget: run.toolBudget,
    },
    provider,
    request,
    plan,
    evidenceCount: contextSnapshot.evidenceCount,
    policyRules: rules,
    executionMode,
  });
}

async function resumeRunAndWorkflow(
  ctx: AppContext,
  db: AppVariables["store"]["db"],
  input: { orgId: string; actorId: string; actorRole: string; runId: string },
) {
  const run = await loadAgentRun(db, input.orgId, input.runId);
  if (!run) return null;
  if (run.trigger === "workflow_tool") {
    const workflow = await resumeWorkflowToolApproval(
      db,
      { orgId: input.orgId, agentRunId: input.runId, actorId: input.actorId },
      ctx.env,
      ctx.authConfig,
    );
    return { runId: run.id, status: workflow.status ?? run.status, workflow };
  }
  if (run.trigger === "api_custom_action") {
    const snapshot = run.inputSnapshot;
    const actionId = typeof snapshot.actionId === "string" ? snapshot.actionId : undefined;
    if (!actionId) {
      return { runId: run.id, status: "failed" as const, error: "run_not_resumable" };
    }
    const [action] = await db
      .select()
      .from(customActions)
      .where(and(eq(customActions.id, actionId), eq(customActions.orgId, input.orgId)))
      .limit(1);
    if (!action || action.brandId !== run.brandId) {
      return { runId: run.id, status: "failed" as const, error: "action_not_found" };
    }
    const parameters =
      snapshot.parameters &&
      typeof snapshot.parameters === "object" &&
      !Array.isArray(snapshot.parameters)
        ? (snapshot.parameters as Record<string, unknown>)
        : {};
    const timeoutMs = typeof snapshot.timeoutMs === "number" ? snapshot.timeoutMs : undefined;
    const idempotencyScope =
      typeof snapshot.idempotencyScope === "string" ? snapshot.idempotencyScope : undefined;
    const tool = createCustomActionDraftTool(
      db,
      action,
      {
        orgId: input.orgId,
        source: "api",
        triggeredBy: input.actorId,
        timeoutMs,
      },
      {
        fetch: globalThis.fetch.bind(globalThis),
        getSecret: (secretRef) => resolveCustomActionSecretFromEnv(secretRef),
      },
      { otelEnabled: ctx.env.OTEL_ENABLED, resultMode: "envelope" },
    );
    return executeGovernedToolCall(db, {
      orgId: input.orgId,
      brandId: action.brandId,
      trigger: "api_custom_action",
      actorType: "member",
      actorId: input.actorId,
      actorRole: input.actorRole,
      channel: "api",
      executionMode: "governed",
      tool,
      arguments: parameters,
      inputSnapshot: snapshot,
      idempotencyScope,
      existingRunId: run.id,
    });
  }
  const result = await resumeRun(ctx, db, input);
  if (!result || "error" in result || run.trigger !== "workflow_let_keeni_answer") return result;
  const workflow = await resumeWorkflowAgentApproval(
    db,
    { orgId: input.orgId, agentRunId: run.id, result },
    ctx.env,
    ctx.authConfig,
  );
  return { ...result, workflow };
}

export function agentRunRoutes(ctx: AppContext) {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}`;

  r.get(`${prefix}/agent-runs`, requireAuth(), zValidator("query", listRunsSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const query = c.req.valid("query");
    const filters = [eq(agentRuns.orgId, auth.orgId)];
    if (query.status) filters.push(eq(agentRuns.status, query.status));
    if (query.conversationId) filters.push(eq(agentRuns.conversationId, query.conversationId));
    const rows = await c
      .get("store")
      .db.select()
      .from(agentRuns)
      .where(and(...filters))
      .orderBy(desc(agentRuns.createdAt))
      .limit(query.limit);
    return c.json({
      items: rows.filter((run) => !run.brandId || canAccessBrand(auth, run.brandId)),
    });
  });

  r.get(`${prefix}/agent-runs/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const trace = await getAgentRunTrace(c.get("store").db, auth.orgId, c.req.param("id"));
    if (!trace) return c.json({ error: "not_found" }, 404);
    if (trace.run.brandId && !canAccessBrand(auth, trace.run.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }
    return c.json(trace);
  });

  r.post(
    `${prefix}/agent-runs/:id/feedback`,
    requireAuth(),
    zValidator("json", evaluationFeedbackSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const db = c.get("store").db;
      const run = await loadAgentRun(db, auth.orgId, c.req.param("id"));
      if (!run) return c.json({ error: "not_found" }, 404);
      if (run.brandId && !canAccessBrand(auth, run.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }
      const body = c.req.valid("json");
      const [feedback] = await db
        .insert(agentEvaluationFeedback)
        .values({
          runId: run.id,
          orgId: auth.orgId,
          evaluatorId: auth.memberId,
          ...body,
        })
        .returning();
      await appendAgentRunEvent(db, {
        runId: run.id,
        orgId: auth.orgId,
        phase: "observe",
        eventType: "evaluation.feedback_recorded",
        actorType: "member",
        actorId: auth.memberId,
        payload: {
          feedbackId: feedback?.id,
          verdict: body.verdict,
          csatScore: body.csatScore ?? null,
          hasCorrection: Boolean(body.correctedResponse),
        },
      });
      return c.json({ feedback }, 201);
    },
  );

  r.get(`${prefix}/agent-eval-cases`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const rows = await c
      .get("store")
      .db.select()
      .from(agentEvalCases)
      .where(eq(agentEvalCases.orgId, auth.orgId))
      .orderBy(desc(agentEvalCases.updatedAt));
    return c.json({
      items: rows.filter((row) => !row.brandId || canAccessBrand(auth, row.brandId)),
    });
  });

  r.post(
    `${prefix}/agent-eval-cases`,
    requireAuth(),
    zValidator("json", evalCaseSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      if (!canManagePolicies(auth.role)) return c.json({ error: "forbidden" }, 403);
      const body = c.req.valid("json");
      if (body.brandId && !canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }
      const [item] = await c
        .get("store")
        .db.insert(agentEvalCases)
        .values({ ...body, orgId: auth.orgId, createdBy: auth.memberId })
        .returning();
      return c.json({ item }, 201);
    },
  );

  r.delete(`${prefix}/agent-eval-cases/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (!canManagePolicies(auth.role)) return c.json({ error: "forbidden" }, 403);
    const [item] = await c
      .get("store")
      .db.delete(agentEvalCases)
      .where(and(eq(agentEvalCases.id, c.req.param("id")), eq(agentEvalCases.orgId, auth.orgId)))
      .returning();
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  r.post(`${prefix}/agent-runs/:id/resume`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const db = c.get("store").db;
    const run = await loadAgentRun(db, auth.orgId, c.req.param("id"));
    if (!run) return c.json({ error: "not_found" }, 404);
    if (run.brandId && !canAccessBrand(auth, run.brandId)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const result = await resumeRunAndWorkflow(ctx, db, {
      orgId: auth.orgId,
      actorId: auth.memberId,
      actorRole: auth.role,
      runId: c.req.param("id"),
    });
    if (!result) return c.json({ error: "not_found" }, 404);
    if ("error" in result) return c.json(result, 409);
    return c.json({ result });
  });

  r.get(`${prefix}/agent-approvals`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const status = c.req.query("status") ?? "pending";
    const rows = await c
      .get("store")
      .db.select()
      .from(agentApprovals)
      .where(and(eq(agentApprovals.orgId, auth.orgId), eq(agentApprovals.status, status)))
      .orderBy(desc(agentApprovals.createdAt));
    return c.json({ items: rows });
  });

  r.post(
    `${prefix}/agent-approvals/:id/decision`,
    requireAuth(),
    zValidator("json", approvalDecisionSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const db = c.get("store").db;
      const [approval] = await db
        .select()
        .from(agentApprovals)
        .where(and(eq(agentApprovals.id, c.req.param("id")), eq(agentApprovals.orgId, auth.orgId)))
        .limit(1);
      if (!approval) return c.json({ error: "not_found" }, 404);
      if (approval.status !== "pending") return c.json({ error: "already_decided" }, 409);
      if (approval.expiresAt && approval.expiresAt.getTime() <= Date.now()) {
        await db
          .update(agentApprovals)
          .set({ status: "expired", decidedAt: new Date(), reason: "approval_expired" })
          .where(eq(agentApprovals.id, approval.id));
        return c.json({ error: "approval_expired" }, 409);
      }
      if (
        (approval.riskLevel === "r3" || approval.riskLevel === "r4") &&
        !canManagePolicies(auth.role)
      ) {
        return c.json({ error: "high_risk_approval_requires_admin" }, 403);
      }
      if (
        approval.requestedBy === auth.memberId &&
        (approval.riskLevel === "r3" || approval.riskLevel === "r4")
      ) {
        return c.json({ error: "requester_cannot_self_approve_high_risk_action" }, 403);
      }

      const body = c.req.valid("json");
      const run = await loadAgentRun(db, auth.orgId, approval.runId);
      if (!run) return c.json({ error: "run_not_found" }, 404);
      if (run.brandId && !canAccessBrand(auth, run.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }
      const [existingDecision] = await db
        .select()
        .from(agentApprovalDecisions)
        .where(
          and(
            eq(agentApprovalDecisions.approvalId, approval.id),
            eq(agentApprovalDecisions.decidedBy, auth.memberId),
          ),
        )
        .limit(1);
      if (existingDecision) return c.json({ error: "approver_already_decided" }, 409);
      await db.insert(agentApprovalDecisions).values({
        approvalId: approval.id,
        orgId: auth.orgId,
        decidedBy: auth.memberId,
        decision: body.decision,
        reason: body.reason ?? null,
      });
      const decisions = await db
        .select()
        .from(agentApprovalDecisions)
        .where(eq(agentApprovalDecisions.approvalId, approval.id));
      const approvalCount = decisions.filter((decision) => decision.decision === "approved").length;
      const finalStatus =
        body.decision === "rejected"
          ? "rejected"
          : approvalCount >= approval.requiredApprovals
            ? "approved"
            : "pending";
      await db
        .update(agentApprovals)
        .set({
          status: finalStatus,
          approvalCount,
          reason: body.reason ?? approval.reason,
          decidedBy: finalStatus === "pending" ? null : auth.memberId,
          decidedAt: finalStatus === "pending" ? null : new Date(),
        })
        .where(eq(agentApprovals.id, approval.id));
      await appendAgentRunEvent(db, {
        runId: approval.runId,
        orgId: auth.orgId,
        phase: body.decision === "approved" ? "act" : "escalate",
        eventType: finalStatus === "pending" ? "approval.recorded" : `approval.${finalStatus}`,
        actorType: "member",
        actorId: auth.memberId,
        payload: {
          approvalId: approval.id,
          reason: body.reason ?? null,
          approvalCount,
          requiredApprovals: approval.requiredApprovals,
        },
      });
      if (body.decision === "rejected") {
        await createAgentEscalation(db, {
          runId: approval.runId,
          orgId: auth.orgId,
          conversationId: run.conversationId,
          reasonCode: "approval_rejected",
          severity: "high",
          failedStep: approval.toolName,
          attemptedActions: [approval.toolName],
          recommendedNextAction: "Complete the action manually or revise the tool policy.",
        });
        await failWorkflowAfterAgentRejection(db, {
          orgId: auth.orgId,
          agentRunId: approval.runId,
          reason: body.reason ?? "approval_rejected",
        });
        return c.json({ approval: { id: approval.id, status: body.decision } });
      }

      if (finalStatus === "pending") {
        return c.json({
          approval: {
            id: approval.id,
            status: finalStatus,
            approvalCount,
            requiredApprovals: approval.requiredApprovals,
          },
        });
      }

      const result = body.resume
        ? await resumeRunAndWorkflow(ctx, db, {
            orgId: auth.orgId,
            actorId: auth.memberId,
            actorRole: auth.role,
            runId: approval.runId,
          })
        : null;
      return c.json({ approval: { id: approval.id, status: finalStatus }, result });
    },
  );

  r.get(`${prefix}/agent-tool-policies`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const rows = await c
      .get("store")
      .db.select()
      .from(agentToolPolicies)
      .where(eq(agentToolPolicies.orgId, auth.orgId))
      .orderBy(desc(agentToolPolicies.updatedAt));
    return c.json({ items: rows });
  });

  r.post(
    `${prefix}/agent-tool-policies`,
    requireAuth(),
    zValidator("json", policyBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      if (!canManagePolicies(auth.role)) return c.json({ error: "forbidden" }, 403);
      const body = c.req.valid("json");
      if (body.brandId && !canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }
      const [row] = await c
        .get("store")
        .db.insert(agentToolPolicies)
        .values({ ...body, orgId: auth.orgId, createdBy: auth.memberId })
        .returning();
      return c.json({ policy: row }, 201);
    },
  );

  r.patch(
    `${prefix}/agent-tool-policies/:id`,
    requireAuth(),
    zValidator("json", updatePolicyBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      if (!canManagePolicies(auth.role)) return c.json({ error: "forbidden" }, 403);
      const body = c.req.valid("json");
      if (body.brandId && !canAccessBrand(auth, body.brandId)) {
        return c.json({ error: "forbidden" }, 403);
      }
      const [row] = await c
        .get("store")
        .db.update(agentToolPolicies)
        .set({ ...body, updatedAt: new Date() })
        .where(
          and(eq(agentToolPolicies.id, c.req.param("id")), eq(agentToolPolicies.orgId, auth.orgId)),
        )
        .returning();
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json({ policy: row });
    },
  );

  r.delete(`${prefix}/agent-tool-policies/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (!canManagePolicies(auth.role)) return c.json({ error: "forbidden" }, 403);
    await c
      .get("store")
      .db.delete(agentToolPolicies)
      .where(
        and(eq(agentToolPolicies.id, c.req.param("id")), eq(agentToolPolicies.orgId, auth.orgId)),
      );
    return c.body(null, 204);
  });

  r.get(`${prefix}/agent-escalations`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const status = c.req.query("status") ?? "open";
    const rows = await c
      .get("store")
      .db.select()
      .from(agentEscalations)
      .where(and(eq(agentEscalations.orgId, auth.orgId), eq(agentEscalations.status, status)))
      .orderBy(desc(agentEscalations.createdAt));
    return c.json({ items: rows });
  });

  r.post(
    `${prefix}/agent-escalations/:id/decision`,
    requireAuth(),
    zValidator("json", escalationDecisionSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const body = c.req.valid("json");
      const [row] = await c
        .get("store")
        .db.update(agentEscalations)
        .set({
          status: body.action === "resolve" ? "resolved" : "acknowledged",
          assigneeId: body.assigneeId,
          assignedTeamId: body.assignedTeamId,
          ...(body.action === "resolve"
            ? { resolvedAt: new Date() }
            : { acknowledgedAt: new Date() }),
          updatedAt: new Date(),
        })
        .where(
          and(eq(agentEscalations.id, c.req.param("id")), eq(agentEscalations.orgId, auth.orgId)),
        )
        .returning();
      if (!row) return c.json({ error: "not_found" }, 404);
      await appendAgentRunEvent(c.get("store").db, {
        runId: row.runId,
        orgId: auth.orgId,
        phase: "escalate",
        eventType: `escalation.${body.action === "resolve" ? "resolved" : "acknowledged"}`,
        actorType: "member",
        actorId: auth.memberId,
        payload: { escalationId: row.id },
      });
      return c.json({ escalation: row });
    },
  );

  return r;
}
