import { createHash } from "node:crypto";
import type { AgentToolPolicyRule, StructuredAgentPlan } from "@keenai/agent";
import type { KeenaiDb } from "@keenai/storage";
import {
  type AgentPolicyEffect,
  type AgentRiskLevel,
  type AgentRunPhase,
  type AgentRunStatus,
  agentApprovals,
  agentContextSnapshots,
  agentEscalations,
  agentEvaluationFeedback,
  agentEvaluations,
  agentPlans,
  agentPolicyDecisions,
  agentRetrievalEvidence,
  agentRunEvents,
  agentRuns,
  agentToolCalls,
  agentToolPolicies,
} from "@keenai/storage/schema";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";

const SECRET_KEY = /authorization|cookie|token|secret|password|api[-_]?key|credential/i;
const SECRET_VALUE = /bearer\s+[a-z0-9._~+\/-]+=*|(?:api[-_]?key|password|secret)\s*[:=]\s*\S+/gi;
const CARD_VALUE = /\b\d{13,19}\b/g;

export function sanitizeAuditValue(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        sanitizeAuditValue(child, childKey),
      ]),
    );
  }
  if (typeof value === "string") {
    const redacted = value.replace(SECRET_VALUE, "[REDACTED]").replace(CARD_VALUE, "[REDACTED]");
    if (redacted.length > 8_000) return `${redacted.slice(0, 8_000)}…`;
    return redacted;
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function hashAuditValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export async function createAgentRun(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId?: string | null;
    conversationId?: string | null;
    workflowRunId?: string | null;
    parentRunId?: string | null;
    trigger: string;
    actorType: string;
    actorId?: string | null;
    providerId?: string | null;
    maxIterations?: number;
    toolBudget?: number;
    tokenBudget?: number;
    inputSnapshot: Record<string, unknown>;
  },
) {
  const [run] = await db
    .insert(agentRuns)
    .values({
      orgId: input.orgId,
      brandId: input.brandId ?? null,
      conversationId: input.conversationId ?? null,
      workflowRunId: input.workflowRunId ?? null,
      parentRunId: input.parentRunId ?? null,
      trigger: input.trigger,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      providerId: input.providerId ?? null,
      maxIterations: input.maxIterations ?? 10,
      toolBudget: input.toolBudget ?? 8,
      tokenBudget: input.tokenBudget ?? 6000,
      retentionUntil: new Date(Date.now() + 365 * 24 * 60 * 60_000),
      inputSnapshot: sanitizeAuditValue(input.inputSnapshot) as Record<string, unknown>,
    })
    .returning();
  if (!run) throw new Error("agent_run_create_failed");
  await appendAgentRunEvent(db, {
    runId: run.id,
    orgId: run.orgId,
    phase: "plan",
    eventType: "run.created",
    actorType: input.actorType,
    actorId: input.actorId,
    payload: { trigger: input.trigger, providerId: input.providerId ?? null },
  });
  return run;
}

export async function appendAgentRunEvent(
  db: KeenaiDb,
  input: {
    runId: string;
    orgId: string;
    phase: AgentRunPhase;
    eventType: string;
    actorType?: string;
    actorId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  const [previous] = await db
    .select({ sequence: agentRunEvents.sequence, eventHash: agentRunEvents.eventHash })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, input.runId))
    .orderBy(desc(agentRunEvents.sequence))
    .limit(1);
  const sequence = (previous?.sequence ?? 0) + 1;
  const payload = sanitizeAuditValue(input.payload ?? {}) as Record<string, unknown>;
  const createdAt = new Date();
  const previousHash = previous?.eventHash || null;
  const eventHash = hashAuditValue({
    runId: input.runId,
    sequence,
    phase: input.phase,
    eventType: input.eventType,
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? null,
    payload,
    previousHash,
    createdAt: createdAt.toISOString(),
  });
  const [event] = await db
    .insert(agentRunEvents)
    .values({
      runId: input.runId,
      orgId: input.orgId,
      sequence,
      phase: input.phase,
      eventType: input.eventType,
      actorType: input.actorType ?? "system",
      actorId: input.actorId ?? null,
      payload,
      previousHash,
      eventHash,
      createdAt,
    })
    .returning();
  return event;
}

export function verifyAgentRunEventChain(events: Array<typeof agentRunEvents.$inferSelect>): {
  valid: boolean;
  checked: number;
  brokenAtSequence?: number;
} {
  let previousHash: string | null = null;
  let expectedSequence = 1;
  for (const event of events) {
    const expectedHash = hashAuditValue({
      runId: event.runId,
      sequence: event.sequence,
      phase: event.phase,
      eventType: event.eventType,
      actorType: event.actorType,
      actorId: event.actorId,
      payload: event.payload,
      previousHash,
      createdAt: event.createdAt.toISOString(),
    });
    if (
      event.sequence !== expectedSequence ||
      event.previousHash !== previousHash ||
      event.eventHash !== expectedHash
    ) {
      return { valid: false, checked: expectedSequence - 1, brokenAtSequence: event.sequence };
    }
    previousHash = event.eventHash;
    expectedSequence += 1;
  }
  return { valid: true, checked: events.length };
}

export async function transitionAgentRun(
  db: KeenaiDb,
  input: {
    runId: string;
    orgId: string;
    status: AgentRunStatus;
    phase: AgentRunPhase;
    eventType?: string;
    payload?: Record<string, unknown>;
    outputSnapshot?: Record<string, unknown>;
    errorCode?: string | null;
    completed?: boolean;
  },
) {
  await db
    .update(agentRuns)
    .set({
      status: input.status,
      phase: input.phase,
      updatedAt: new Date(),
      ...(input.outputSnapshot
        ? {
            outputSnapshot: sanitizeAuditValue(input.outputSnapshot) as Record<string, unknown>,
          }
        : {}),
      ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
      ...(input.completed ? { completedAt: new Date() } : {}),
    })
    .where(and(eq(agentRuns.id, input.runId), eq(agentRuns.orgId, input.orgId)));
  if (input.eventType) {
    await appendAgentRunEvent(db, {
      runId: input.runId,
      orgId: input.orgId,
      phase: input.phase,
      eventType: input.eventType,
      payload: input.payload,
    });
  }
}

export async function persistAgentPlan(
  db: KeenaiDb,
  input: { runId: string; orgId: string; plan: StructuredAgentPlan },
) {
  const [row] = await db
    .insert(agentPlans)
    .values({ runId: input.runId, orgId: input.orgId, version: 1, ...input.plan })
    .returning();
  await transitionAgentRun(db, {
    runId: input.runId,
    orgId: input.orgId,
    status: "retrieving",
    phase: "retrieve",
    eventType: "plan.committed",
    payload: {
      planId: row?.id,
      intent: input.plan.intent,
      riskLevel: input.plan.riskLevel,
      allowedTools: input.plan.allowedTools,
    },
  });
  return row;
}

export async function persistAgentContext(
  db: KeenaiDb,
  input: {
    runId: string;
    orgId: string;
    memoryScope: string;
    intent: string;
    weights: Record<string, unknown>;
    sections: Array<{
      title: string;
      body: string;
      source: string;
      score?: number;
      reason?: string;
      evidence?: Array<{
        sourceType: string;
        sourceId: string;
        sourceVersion?: string;
        scope?: string;
        score?: number;
        metadata?: Record<string, unknown>;
      }>;
    }>;
    text: string;
  },
) {
  const contextHash = hashAuditValue(input.text);
  const safeSections = input.sections.map((section) => ({
    title: section.title,
    source: section.source,
    score: section.score,
    reason: section.reason,
    bodyHash: hashAuditValue(section.body),
    preview: section.body.slice(0, 500),
  }));
  const [snapshot] = await db
    .insert(agentContextSnapshots)
    .values({
      runId: input.runId,
      orgId: input.orgId,
      memoryScope: input.memoryScope,
      intent: input.intent,
      weights: input.weights,
      sections: safeSections,
      contextHash,
      contextPreview: input.text.slice(0, 2_000),
    })
    .returning();

  const evidence = input.sections.flatMap((section) =>
    (section.evidence ?? []).map((item) => ({
      runId: input.runId,
      orgId: input.orgId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceVersion: item.sourceVersion ?? null,
      scope: item.scope ?? null,
      score: item.score ?? section.score ?? null,
      reason: section.reason ?? null,
      contentHash: hashAuditValue(section.body),
      metadata: {
        title: section.title,
        source: section.source,
        ...(item.metadata ?? {}),
      },
    })),
  );
  if (evidence.length > 0) await db.insert(agentRetrievalEvidence).values(evidence);

  await appendAgentRunEvent(db, {
    runId: input.runId,
    orgId: input.orgId,
    phase: "retrieve",
    eventType: "context.snapshot",
    payload: {
      snapshotId: snapshot?.id,
      contextHash,
      memoryScope: input.memoryScope,
      intent: input.intent,
      evidenceCount: evidence.length,
    },
  });
  return { snapshot, evidenceCount: evidence.length };
}

export async function loadAgentToolPolicyRules(
  db: KeenaiDb,
  input: { orgId: string; brandId?: string | null },
): Promise<AgentToolPolicyRule[]> {
  const rows = await db
    .select()
    .from(agentToolPolicies)
    .where(
      and(
        eq(agentToolPolicies.orgId, input.orgId),
        eq(agentToolPolicies.enabled, true),
        input.brandId
          ? or(eq(agentToolPolicies.brandId, input.brandId), isNull(agentToolPolicies.brandId))
          : isNull(agentToolPolicies.brandId),
      ),
    )
    .orderBy(desc(agentToolPolicies.brandId), desc(agentToolPolicies.ruleVersion));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    toolPattern: row.toolPattern,
    effect: row.effect,
    riskLevel: row.riskLevel,
    ruleVersion: row.ruleVersion,
    argumentConstraints: row.argumentConstraints,
    actorRoles: row.actorRoles,
    channels: row.channels,
    resourcePatterns: row.resourcePatterns,
    requiredApprovals: row.requiredApprovals,
  }));
}

export async function createAgentEscalation(
  db: KeenaiDb,
  input: {
    runId: string;
    orgId: string;
    conversationId?: string | null;
    reasonCode: string;
    severity: "low" | "medium" | "high" | "critical";
    failedStep?: string | null;
    evidenceIds?: string[];
    attemptedActions?: string[];
    recommendedNextAction?: string | null;
  },
) {
  const [existing] = await db
    .select()
    .from(agentEscalations)
    .where(
      and(
        eq(agentEscalations.runId, input.runId),
        eq(agentEscalations.reasonCode, input.reasonCode),
        eq(agentEscalations.status, "open"),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(agentEscalations)
    .values({
      runId: input.runId,
      orgId: input.orgId,
      conversationId: input.conversationId ?? null,
      reasonCode: input.reasonCode,
      severity: input.severity,
      failedStep: input.failedStep ?? null,
      evidenceIds: input.evidenceIds ?? [],
      attemptedActions: input.attemptedActions ?? [],
      recommendedNextAction: input.recommendedNextAction ?? null,
      slaDeadline: new Date(Date.now() + (input.severity === "critical" ? 15 : 60) * 60_000),
    })
    .returning();
  await transitionAgentRun(db, {
    runId: input.runId,
    orgId: input.orgId,
    status: "escalated",
    phase: "escalate",
    eventType: "escalation.created",
    payload: { escalationId: row?.id, reasonCode: input.reasonCode, severity: input.severity },
  });
  return row;
}

export async function persistAgentEvaluation(
  db: KeenaiDb,
  input: {
    runId: string;
    orgId: string;
    planComplete: boolean;
    actionVerified: boolean;
    evidenceCoverage: number;
    citationCoverage: number;
    toolSuccessRate: number;
    score: number;
    outcome: string;
    issues: string[];
  },
) {
  const [row] = await db.insert(agentEvaluations).values(input).returning();
  await appendAgentRunEvent(db, {
    runId: input.runId,
    orgId: input.orgId,
    phase: "observe",
    eventType: "evaluation.completed",
    payload: {
      evaluationId: row?.id,
      score: input.score,
      outcome: input.outcome,
      issues: input.issues,
    },
  });
  return row;
}

export async function getAgentRunTrace(db: KeenaiDb, orgId: string, runId: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.orgId, orgId)))
    .limit(1);
  if (!run) return null;

  const [
    events,
    plans,
    contexts,
    evidence,
    policies,
    tools,
    approvals,
    escalations,
    evaluations,
    feedback,
  ] = await Promise.all([
    db
      .select()
      .from(agentRunEvents)
      .where(eq(agentRunEvents.runId, runId))
      .orderBy(asc(agentRunEvents.sequence)),
    db
      .select()
      .from(agentPlans)
      .where(eq(agentPlans.runId, runId))
      .orderBy(desc(agentPlans.version)),
    db
      .select()
      .from(agentContextSnapshots)
      .where(eq(agentContextSnapshots.runId, runId))
      .orderBy(desc(agentContextSnapshots.createdAt)),
    db
      .select()
      .from(agentRetrievalEvidence)
      .where(eq(agentRetrievalEvidence.runId, runId))
      .orderBy(asc(agentRetrievalEvidence.retrievedAt)),
    db
      .select()
      .from(agentPolicyDecisions)
      .where(eq(agentPolicyDecisions.runId, runId))
      .orderBy(asc(agentPolicyDecisions.createdAt)),
    db
      .select()
      .from(agentToolCalls)
      .where(eq(agentToolCalls.runId, runId))
      .orderBy(asc(agentToolCalls.createdAt)),
    db
      .select()
      .from(agentApprovals)
      .where(eq(agentApprovals.runId, runId))
      .orderBy(asc(agentApprovals.createdAt)),
    db
      .select()
      .from(agentEscalations)
      .where(eq(agentEscalations.runId, runId))
      .orderBy(asc(agentEscalations.createdAt)),
    db
      .select()
      .from(agentEvaluations)
      .where(eq(agentEvaluations.runId, runId))
      .orderBy(desc(agentEvaluations.createdAt)),
    db
      .select()
      .from(agentEvaluationFeedback)
      .where(eq(agentEvaluationFeedback.runId, runId))
      .orderBy(desc(agentEvaluationFeedback.createdAt)),
  ]);
  return {
    run,
    integrity: verifyAgentRunEventChain(events),
    events,
    plans,
    contexts,
    evidence,
    policyDecisions: policies,
    toolCalls: tools,
    approvals,
    escalations,
    evaluations,
    feedback,
  };
}

export {
  agentApprovals,
  agentEscalations,
  agentPolicyDecisions,
  agentRuns,
  agentToolCalls,
  agentToolPolicies,
};
export type { AgentPolicyEffect, AgentRiskLevel };
