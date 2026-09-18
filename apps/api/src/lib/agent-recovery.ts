import type { KeenaiDb } from "@keenai/storage";
import { agentApprovals, agentRuns, agentToolCalls } from "@keenai/storage/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import {
  appendAgentRunEvent,
  createAgentEscalation,
  transitionAgentRun,
} from "./agent-audit-store.js";
import { failWorkflowAfterAgentRejection } from "./workflow-resume.js";

export async function recoverStaleAgentRuns(
  db: KeenaiDb,
  input: { staleBefore: Date; now?: Date },
) {
  const now = input.now ?? new Date();
  const staleCalls = await db
    .select()
    .from(agentToolCalls)
    .where(
      and(eq(agentToolCalls.status, "running"), lt(agentToolCalls.startedAt, input.staleBefore)),
    );
  let retryable = 0;
  let escalated = 0;

  for (const call of staleCalls) {
    if (call.idempotent) {
      await db
        .update(agentToolCalls)
        .set({ status: "failed", errorCode: "interrupted_retryable", completedAt: now })
        .where(and(eq(agentToolCalls.id, call.id), eq(agentToolCalls.status, "running")));
      await transitionAgentRun(db, {
        runId: call.runId,
        orgId: call.orgId,
        status: "failed",
        phase: "observe",
        eventType: "recovery.retryable",
        errorCode: "interrupted_retryable",
        payload: { toolCallId: call.id, toolName: call.toolName },
      });
      retryable += 1;
      continue;
    }

    await db
      .update(agentToolCalls)
      .set({ status: "outcome_unknown", errorCode: "tool_outcome_unknown", completedAt: now })
      .where(and(eq(agentToolCalls.id, call.id), eq(agentToolCalls.status, "running")));
    const [run] = await db
      .select({ conversationId: agentRuns.conversationId })
      .from(agentRuns)
      .where(eq(agentRuns.id, call.runId))
      .limit(1);
    await createAgentEscalation(db, {
      runId: call.runId,
      orgId: call.orgId,
      conversationId: run?.conversationId,
      reasonCode: "tool_outcome_unknown",
      severity: "high",
      failedStep: call.toolName,
      attemptedActions: [call.toolName],
      recommendedNextAction: "Verify the external side effect before any manual retry.",
    });
    escalated += 1;
  }

  const expiredApprovals = await db
    .select()
    .from(agentApprovals)
    .where(and(eq(agentApprovals.status, "pending"), lt(agentApprovals.expiresAt, now)));
  for (const approval of expiredApprovals) {
    await db
      .update(agentApprovals)
      .set({ status: "expired", reason: "approval_expired", decidedAt: now })
      .where(and(eq(agentApprovals.id, approval.id), eq(agentApprovals.status, "pending")));
    await appendAgentRunEvent(db, {
      runId: approval.runId,
      orgId: approval.orgId,
      phase: "escalate",
      eventType: "approval.expired",
      payload: { approvalId: approval.id, toolName: approval.toolName },
    });
    const [run] = await db
      .select({ conversationId: agentRuns.conversationId })
      .from(agentRuns)
      .where(eq(agentRuns.id, approval.runId))
      .limit(1);
    await createAgentEscalation(db, {
      runId: approval.runId,
      orgId: approval.orgId,
      conversationId: run?.conversationId,
      reasonCode: "approval_expired",
      severity: "medium",
      failedStep: approval.toolName,
      recommendedNextAction:
        "Review the request and start a new approval if the action is still needed.",
    });
    await failWorkflowAfterAgentRejection(db, {
      orgId: approval.orgId,
      agentRunId: approval.runId,
      reason: "approval_expired",
    });
  }

  const activeRunIds = new Set(staleCalls.map((call) => call.runId));
  if (activeRunIds.size > 0) {
    await db
      .update(agentRuns)
      .set({ updatedAt: now })
      .where(inArray(agentRuns.id, [...activeRunIds]));
  }

  const expiredRuns = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        lt(agentRuns.retentionUntil, now),
        inArray(agentRuns.status, ["completed", "escalated", "failed"]),
      ),
    );
  if (expiredRuns.length > 0) {
    await db.delete(agentRuns).where(
      inArray(
        agentRuns.id,
        expiredRuns.map((run) => run.id),
      ),
    );
  }

  return {
    scanned: staleCalls.length,
    retryable,
    escalated,
    approvalsExpired: expiredApprovals.length,
    auditRunsPurged: expiredRuns.length,
  };
}
