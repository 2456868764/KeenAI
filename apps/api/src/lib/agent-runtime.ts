import {
  type AgentRunEvaluation,
  type AgentToolExecutionMode,
  type AgentToolPolicyRule,
  type KeeniResolution,
  type StructuredAgentPlan,
  detectResolution,
  evaluateAgentRun,
  evaluateAgentToolPolicy,
} from "@keenai/agent";
import type { DraftProvider, DraftRequest, DraftToolRuntime } from "@keenai/llm";
import type { KeenaiDb } from "@keenai/storage";
import {
  agentApprovals,
  agentPolicyDecisions,
  agentRuns,
  agentToolCalls,
} from "@keenai/storage/schema";
import { and, eq, ne } from "drizzle-orm";
import {
  appendAgentRunEvent,
  createAgentEscalation,
  hashAuditValue,
  persistAgentEvaluation,
  sanitizeAuditValue,
  transitionAgentRun,
} from "./agent-audit-store.js";

export class AgentApprovalRequiredError extends Error {
  constructor(
    readonly approvalId: string,
    readonly toolName: string,
  ) {
    super(`approval_required:${approvalId}`);
    this.name = "AgentApprovalRequiredError";
  }
}

export class AgentPolicyDeniedError extends Error {
  constructor(readonly toolName: string) {
    super(`tool_policy_denied:${toolName}`);
    this.name = "AgentPolicyDeniedError";
  }
}

export class AgentToolOutcomeUnknownError extends Error {
  constructor(readonly toolName: string) {
    super(`tool_outcome_unknown:${toolName}`);
    this.name = "AgentToolOutcomeUnknownError";
  }
}

export type AgentRuntimeIdentity = {
  runId: string;
  orgId: string;
  conversationId?: string | null;
  actorId?: string | null;
  toolBudget: number;
  idempotencyScope?: string;
  actorRole?: string | null;
  channel?: string | null;
};

function safeErrorCode(error: unknown): string {
  if (error instanceof AgentApprovalRequiredError) return "approval_required";
  if (error instanceof AgentPolicyDeniedError) return "tool_policy_denied";
  if (error instanceof AgentToolOutcomeUnknownError) return "tool_outcome_unknown";
  if (error instanceof Error) {
    if (/^[a-z][a-z0-9_]{1,100}$/.test(error.message)) return error.message;
    return error.name || "agent_execution_failed";
  }
  return "agent_execution_failed";
}

async function findApproval(
  db: KeenaiDb,
  input: { runId: string; toolName: string; inputHash: string },
) {
  const rows = await db
    .select()
    .from(agentApprovals)
    .where(
      and(
        eq(agentApprovals.runId, input.runId),
        eq(agentApprovals.toolName, input.toolName),
        eq(agentApprovals.inputHash, input.inputHash),
      ),
    );
  const active = rows.filter((row) => !row.expiresAt || row.expiresAt.getTime() > Date.now());
  return (
    active.find((row) => row.status === "approved") ??
    active.find((row) => row.status === "pending")
  );
}

async function createOrReuseToolCall(
  db: KeenaiDb,
  identity: AgentRuntimeIdentity,
  tool: DraftToolRuntime,
  args: Record<string, unknown>,
) {
  const idempotencyKey = hashAuditValue([
    identity.idempotencyScope ?? identity.runId,
    tool.name,
    args,
  ]);
  const [existing] = await db
    .select()
    .from(agentToolCalls)
    .where(eq(agentToolCalls.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) return { row: existing, idempotencyKey, reused: true };

  const [row] = await db
    .insert(agentToolCalls)
    .values({
      runId: identity.runId,
      orgId: identity.orgId,
      toolName: tool.name,
      toolSource: tool.audit?.source ?? "builtin",
      riskLevel: tool.audit?.riskLevel ?? "r1",
      status: "created",
      arguments: sanitizeAuditValue(args) as Record<string, unknown>,
      idempotencyKey,
      idempotent: tool.audit?.idempotent ?? false,
    })
    .returning();
  if (!row) throw new Error("agent_tool_call_create_failed");
  return { row, idempotencyKey, reused: false };
}

export function wrapAuditedAgentTools(
  db: KeenaiDb,
  identity: AgentRuntimeIdentity,
  tools: DraftToolRuntime[],
  rules: AgentToolPolicyRule[],
  executionMode: AgentToolExecutionMode = "governed",
): DraftToolRuntime[] {
  let invocationCount = 0;

  return tools.map((tool) => ({
    ...tool,
    execute: async (args) => {
      invocationCount += 1;
      if (invocationCount > identity.toolBudget) {
        await createAgentEscalation(db, {
          runId: identity.runId,
          orgId: identity.orgId,
          conversationId: identity.conversationId,
          reasonCode: "tool_budget_exhausted",
          severity: "high",
          failedStep: tool.name,
          recommendedNextAction: "Review the attempted actions before resuming the run.",
        });
        throw new Error("tool_budget_exhausted");
      }

      const inputHash = hashAuditValue(args);
      const call = await createOrReuseToolCall(db, identity, tool, args);
      if (call.row.status === "succeeded") return call.row.result;
      if (call.row.status === "outcome_unknown" && !call.row.idempotent) {
        throw new AgentToolOutcomeUnknownError(tool.name);
      }

      const decision = evaluateAgentToolPolicy({
        tool,
        args,
        rules,
        executionMode,
        context: {
          actorRole: identity.actorRole,
          channel: identity.channel,
          resource: tool.audit?.sourceId,
        },
      });
      const [decisionRow] = await db
        .insert(agentPolicyDecisions)
        .values({
          runId: identity.runId,
          orgId: identity.orgId,
          toolCallId: call.row.id,
          toolName: tool.name,
          effect: decision.effect,
          riskLevel: decision.riskLevel,
          ruleId: decision.ruleId,
          ruleVersion: decision.ruleVersion,
          reason: decision.reason,
          executionMode,
          inputHash,
        })
        .returning();
      await db
        .update(agentToolCalls)
        .set({
          policyDecisionId: decisionRow?.id ?? null,
          riskLevel: decision.riskLevel,
          status: decision.effect === "deny" ? "denied" : call.row.status,
        })
        .where(eq(agentToolCalls.id, call.row.id));
      await appendAgentRunEvent(db, {
        runId: identity.runId,
        orgId: identity.orgId,
        phase: "act",
        eventType: "policy.decided",
        actorType: "policy",
        payload: {
          toolCallId: call.row.id,
          toolName: tool.name,
          effect: decision.effect,
          riskLevel: decision.riskLevel,
          reason: decision.reason,
        },
      });

      if (decision.effect === "deny") {
        await createAgentEscalation(db, {
          runId: identity.runId,
          orgId: identity.orgId,
          conversationId: identity.conversationId,
          reasonCode: "tool_policy_denied",
          severity: decision.riskLevel === "r4" ? "critical" : "high",
          failedStep: tool.name,
          attemptedActions: [tool.name],
          recommendedNextAction: "Review the policy decision and complete the action manually.",
        });
        throw new AgentPolicyDeniedError(tool.name);
      }

      if (decision.effect === "require_approval") {
        await db
          .update(agentApprovals)
          .set({ status: "expired", decidedAt: new Date(), reason: "tool_arguments_changed" })
          .where(
            and(
              eq(agentApprovals.runId, identity.runId),
              eq(agentApprovals.toolName, tool.name),
              eq(agentApprovals.status, "pending"),
              ne(agentApprovals.inputHash, inputHash),
            ),
          );
        const existingApproval = await findApproval(db, {
          runId: identity.runId,
          toolName: tool.name,
          inputHash,
        });
        if (existingApproval?.status !== "approved") {
          const approval =
            existingApproval ??
            (
              await db
                .insert(agentApprovals)
                .values({
                  runId: identity.runId,
                  orgId: identity.orgId,
                  toolCallId: call.row.id,
                  toolName: tool.name,
                  inputHash,
                  riskLevel: decision.riskLevel,
                  argumentsPreview: sanitizeAuditValue(args) as Record<string, unknown>,
                  requiredApprovals: Math.max(1, decision.requiredApprovals),
                  requestedBy: identity.actorId ?? null,
                  expiresAt: new Date(
                    Date.now() + (decision.riskLevel === "r4" ? 60 : 8 * 60) * 60_000,
                  ),
                })
                .returning()
            )[0];
          if (!approval) throw new Error("agent_approval_create_failed");
          await db
            .update(agentToolCalls)
            .set({ status: "awaiting_approval" })
            .where(eq(agentToolCalls.id, call.row.id));
          await transitionAgentRun(db, {
            runId: identity.runId,
            orgId: identity.orgId,
            status: "awaiting_approval",
            phase: "act",
            eventType: "approval.requested",
            payload: { approvalId: approval.id, toolCallId: call.row.id, toolName: tool.name },
          });
          throw new AgentApprovalRequiredError(approval.id, tool.name);
        }
      }

      const startedAt = new Date();
      await db
        .update(agentToolCalls)
        .set({ status: "running", startedAt })
        .where(eq(agentToolCalls.id, call.row.id));
      await appendAgentRunEvent(db, {
        runId: identity.runId,
        orgId: identity.orgId,
        phase: "act",
        eventType: "tool.started",
        payload: { toolCallId: call.row.id, toolName: tool.name },
      });

      try {
        const result = await tool.execute(args);
        const completedAt = new Date();
        await db
          .update(agentToolCalls)
          .set({
            status: "succeeded",
            result: sanitizeAuditValue(result ?? null),
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
          })
          .where(eq(agentToolCalls.id, call.row.id));
        await appendAgentRunEvent(db, {
          runId: identity.runId,
          orgId: identity.orgId,
          phase: "act",
          eventType: "tool.succeeded",
          payload: { toolCallId: call.row.id, toolName: tool.name },
        });
        return result;
      } catch (error) {
        const completedAt = new Date();
        await db
          .update(agentToolCalls)
          .set({
            status: "failed",
            errorCode: safeErrorCode(error),
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
          })
          .where(eq(agentToolCalls.id, call.row.id));
        await appendAgentRunEvent(db, {
          runId: identity.runId,
          orgId: identity.orgId,
          phase: "act",
          eventType: "tool.failed",
          payload: {
            toolCallId: call.row.id,
            toolName: tool.name,
            errorCode: safeErrorCode(error),
          },
        });
        throw error;
      }
    },
  }));
}

export type AuditedAgentDraftResult = {
  runId: string;
  status: "completed" | "awaiting_approval" | "escalated" | "failed";
  replyText: string;
  resolution?: KeeniResolution;
  evaluation?: AgentRunEvaluation;
  approvalId?: string;
};

export type AuditedToolCallResult = {
  runId: string;
  status: "completed" | "awaiting_approval" | "escalated" | "failed";
  result?: unknown;
  approvalId?: string;
  errorCode?: string;
};

export async function executeAuditedToolCall(input: {
  db: KeenaiDb;
  identity: AgentRuntimeIdentity;
  tool: DraftToolRuntime;
  args: Record<string, unknown>;
  policyRules: AgentToolPolicyRule[];
  executionMode: AgentToolExecutionMode;
}): Promise<AuditedToolCallResult> {
  const { db, identity } = input;
  await transitionAgentRun(db, {
    runId: identity.runId,
    orgId: identity.orgId,
    status: "acting",
    phase: "act",
    eventType: "act.started",
    payload: { toolName: input.tool.name, executionMode: input.executionMode },
  });

  const [tool] = wrapAuditedAgentTools(
    db,
    identity,
    [input.tool],
    input.policyRules,
    input.executionMode,
  );
  if (!tool) throw new Error("tool_runtime_missing");

  try {
    const result = await tool.execute(input.args);
    await transitionAgentRun(db, {
      runId: identity.runId,
      orgId: identity.orgId,
      status: "completed",
      phase: "observe",
      eventType: "run.completed",
      outputSnapshot: { toolName: input.tool.name, result },
      completed: true,
    });
    return { runId: identity.runId, status: "completed", result };
  } catch (error) {
    if (error instanceof AgentApprovalRequiredError) {
      return {
        runId: identity.runId,
        status: "awaiting_approval",
        approvalId: error.approvalId,
      };
    }
    if (error instanceof AgentPolicyDeniedError) {
      return { runId: identity.runId, status: "escalated", errorCode: "tool_policy_denied" };
    }
    if (error instanceof AgentToolOutcomeUnknownError) {
      return { runId: identity.runId, status: "escalated", errorCode: "tool_outcome_unknown" };
    }
    const errorCode = safeErrorCode(error);
    await transitionAgentRun(db, {
      runId: identity.runId,
      orgId: identity.orgId,
      status: "failed",
      phase: "observe",
      eventType: "run.failed",
      errorCode,
      payload: { toolName: input.tool.name, errorCode },
      completed: true,
    });
    await createAgentEscalation(db, {
      runId: identity.runId,
      orgId: identity.orgId,
      conversationId: identity.conversationId,
      reasonCode: "tool_execution_failed",
      severity: "high",
      failedStep: input.tool.name,
      attemptedActions: [input.tool.name],
      recommendedNextAction: "Inspect the tool call and retry or complete it manually.",
    });
    return { runId: identity.runId, status: "failed", errorCode };
  }
}

export async function executeAuditedAgentDraft(input: {
  db: KeenaiDb;
  identity: AgentRuntimeIdentity;
  provider: DraftProvider;
  request: DraftRequest;
  plan: StructuredAgentPlan;
  evidenceCount: number;
  policyRules: AgentToolPolicyRule[];
  executionMode?: AgentToolExecutionMode;
}): Promise<AuditedAgentDraftResult> {
  const { db, identity } = input;
  const request: DraftRequest = {
    ...input.request,
    tools: input.request.tools
      ? wrapAuditedAgentTools(
          db,
          identity,
          input.request.tools,
          input.policyRules,
          input.executionMode ?? "governed",
        )
      : undefined,
  };
  await transitionAgentRun(db, {
    runId: identity.runId,
    orgId: identity.orgId,
    status: "acting",
    phase: "act",
    eventType: "act.started",
    payload: { providerId: input.provider.id, toolCount: request.tools?.length ?? 0 },
  });

  let replyText = "";
  try {
    for await (const chunk of input.provider.streamDraft(request)) {
      if (chunk.type === "text-delta") replyText += chunk.text;
    }
  } catch (error) {
    if (error instanceof AgentApprovalRequiredError) {
      return {
        runId: identity.runId,
        status: "awaiting_approval",
        replyText,
        approvalId: error.approvalId,
      };
    }
    if (error instanceof AgentPolicyDeniedError) {
      return { runId: identity.runId, status: "escalated", replyText };
    }
    if (error instanceof AgentToolOutcomeUnknownError) {
      return { runId: identity.runId, status: "escalated", replyText };
    }

    await transitionAgentRun(db, {
      runId: identity.runId,
      orgId: identity.orgId,
      status: "failed",
      phase: "observe",
      eventType: "run.failed",
      errorCode: safeErrorCode(error),
      payload: { errorCode: safeErrorCode(error) },
      completed: true,
    });
    await createAgentEscalation(db, {
      runId: identity.runId,
      orgId: identity.orgId,
      conversationId: identity.conversationId,
      reasonCode: "agent_execution_failed",
      severity: "high",
      recommendedNextAction: "Inspect the run trace and retry or answer manually.",
    });
    return { runId: identity.runId, status: "failed", replyText };
  }

  await transitionAgentRun(db, {
    runId: identity.runId,
    orgId: identity.orgId,
    status: "observing",
    phase: "observe",
    eventType: "observe.started",
  });
  const customerMessage = request.messages
    .filter((message) => message.role === "user")
    .at(-1)?.plainText;
  const resolution = detectResolution({ replyText, customerMessage, hadError: false });
  const toolCalls = await db
    .select({ status: agentToolCalls.status })
    .from(agentToolCalls)
    .where(eq(agentToolCalls.runId, identity.runId));
  const evaluation = evaluateAgentRun({
    replyText,
    evidenceCount: input.evidenceCount,
    requiredEvidenceCount: input.plan.requiredEvidence.length,
    toolCalls,
    resolution,
    hadError: false,
  });
  await persistAgentEvaluation(db, {
    runId: identity.runId,
    orgId: identity.orgId,
    ...evaluation,
  });

  if (resolution.type === "escalated" || evaluation.outcome === "fail") {
    await createAgentEscalation(db, {
      runId: identity.runId,
      orgId: identity.orgId,
      conversationId: identity.conversationId,
      reasonCode: resolution.type === "escalated" ? "human_requested" : "run_evaluation_failed",
      severity: resolution.type === "escalated" ? "high" : "medium",
      attemptedActions: (request.tools ?? []).map((tool) => tool.name),
      recommendedNextAction: "Review the evidence and continue the conversation manually.",
    });
    return { runId: identity.runId, status: "escalated", replyText, resolution, evaluation };
  }

  await transitionAgentRun(db, {
    runId: identity.runId,
    orgId: identity.orgId,
    status: "completed",
    phase: "observe",
    eventType: "run.completed",
    outputSnapshot: {
      replyText,
      resolution,
      evaluation: { score: evaluation.score, outcome: evaluation.outcome },
    },
    completed: true,
  });
  return { runId: identity.runId, status: "completed", replyText, resolution, evaluation };
}

export async function loadAgentRun(db: KeenaiDb, orgId: string, runId: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.orgId, orgId)))
    .limit(1);
  return run ?? null;
}
