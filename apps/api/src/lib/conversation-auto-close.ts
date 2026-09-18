import type { AgentAbandonedWorkflowTrigger } from "@keenai/shared";
import type { KeenaiDb } from "@keenai/storage";
import {
  agentRuns,
  conversationAutoCloseJobs,
  conversationEvents,
  conversations,
  messages,
  workflowRuns,
} from "@keenai/storage/schema";
import type { WorkflowDefinition } from "@keenai/workflow";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getOrCreateAgentOtherSettings } from "./agent-settings.js";

const AUTO_CLOSE_ATTRIBUTE = "keenaiAutoClose";
const ACTIVE_JOB_STATUSES = ["pending", "processing"] as const;
const MAX_JOB_ATTEMPTS = 5;

type AutoCloseMarker = {
  jobId: string;
  kind: "resolved" | "workflow_abandoned";
  closedAt: string;
};

function readAutoCloseMarker(attributes: Record<string, unknown>): AutoCloseMarker | null {
  const value = attributes[AUTO_CLOSE_ATTRIBUTE];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const marker = value as Record<string, unknown>;
  if (
    typeof marker.jobId !== "string" ||
    (marker.kind !== "resolved" && marker.kind !== "workflow_abandoned") ||
    typeof marker.closedAt !== "string"
  ) {
    return null;
  }
  return marker as AutoCloseMarker;
}

export function wasConversationAutoClosed(attributes: Record<string, unknown>): boolean {
  return readAutoCloseMarker(attributes) !== null;
}

export function clearConversationAutoCloseMarker(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const { [AUTO_CLOSE_ATTRIBUTE]: _marker, ...rest } = attributes;
  return rest;
}

export function markConversationAutoClosedAttributes(
  attributes: Record<string, unknown>,
  marker: AutoCloseMarker,
): Record<string, unknown> {
  return { ...attributes, [AUTO_CLOSE_ATTRIBUTE]: marker };
}

async function latestPublicMessage(db: KeenaiDb, conversationId: string) {
  const [row] = await db
    .select({ id: messages.id, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.isInternal, false)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  return row ?? null;
}

export function workflowTriggerMatchesAgentSetting(
  workflowTrigger: string,
  selected: AgentAbandonedWorkflowTrigger[],
): boolean {
  if (workflowTrigger === "page_view") {
    return selected.includes("user_visits_website") || selected.includes("visitor_visits_page");
  }
  if (workflowTrigger === "new_messenger_conversation") {
    return (
      selected.includes("user_opens_conversation") ||
      selected.includes("visitor_opens_conversation")
    );
  }
  return selected.includes(workflowTrigger as AgentAbandonedWorkflowTrigger);
}

async function createAutoCloseJob(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId: string;
    conversationId: string;
    kind: "resolved" | "workflow_abandoned";
    policySource: "brand" | "block";
    dedupeKey: string;
    delayMinutes: number;
    workflowRunId?: string;
    workflowBlockId?: string;
    workflowTrigger?: string;
    agentRunId?: string;
    resolutionType?: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const basis = await latestPublicMessage(db, input.conversationId);
  const [conversation] = await db
    .select({ lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);
  if (!conversation) throw new Error("conversation_not_found");
  const inserted = await db
    .insert(conversationAutoCloseJobs)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      conversationId: input.conversationId,
      kind: input.kind,
      policySource: input.policySource,
      dedupeKey: input.dedupeKey,
      dueAt: new Date(now.getTime() + input.delayMinutes * 60_000),
      basisMessageId: basis?.id,
      basisLastMessageAt: conversation.lastMessageAt,
      workflowRunId: input.workflowRunId,
      workflowBlockId: input.workflowBlockId,
      workflowTrigger: input.workflowTrigger,
      agentRunId: input.agentRunId,
      resolutionType: input.resolutionType,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: conversationAutoCloseJobs.dedupeKey })
    .returning({ id: conversationAutoCloseJobs.id });

  const [job] = await db
    .select()
    .from(conversationAutoCloseJobs)
    .where(eq(conversationAutoCloseJobs.dedupeKey, input.dedupeKey))
    .limit(1);
  if (!job) throw new Error("auto_close_job_create_failed");

  if (inserted.length > 0) {
    await db.insert(conversationEvents).values({
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.auto_close_scheduled",
      actorType: "system",
      payload: {
        jobId: job.id,
        kind: job.kind,
        dueAt: job.dueAt.toISOString(),
        policySource: job.policySource,
      },
    });
  }
  return job;
}

export async function scheduleResolvedConversationAutoClose(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId: string;
    conversationId: string;
    agentRunId?: string;
    sourceId?: string;
    resolutionType: string;
    now?: Date;
  },
) {
  if (input.resolutionType !== "confirmed" && input.resolutionType !== "assumed") return null;
  const sourceId = input.agentRunId ?? input.sourceId;
  if (!sourceId) throw new Error("resolved_auto_close_source_required");
  const settings = await getOrCreateAgentOtherSettings(db, input);
  if (!settings.autoCloseResolvedEnabled) return null;
  return createAutoCloseJob(db, {
    ...input,
    kind: "resolved",
    policySource: "brand",
    dedupeKey: `resolved:${sourceId}`,
    delayMinutes: settings.autoCloseResolvedDelayMinutes,
  });
}

function blockAutoCloseMinutes(definition: WorkflowDefinition, blockId: string): number | null {
  const block = definition.blocks.find((candidate) => candidate.id === blockId);
  if (
    !block ||
    (block.type !== "collect_data" &&
      block.type !== "send_ticket_form" &&
      block.type !== "collect_customer_reply" &&
      block.type !== "reply_buttons")
  ) {
    return null;
  }
  return block.autoCloseMinutes && block.autoCloseMinutes > 0 ? block.autoCloseMinutes : null;
}

export async function scheduleWorkflowAbandonedAutoClose(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId: string;
    conversationId: string;
    workflowRunId: string;
    workflowBlockId: string;
    workflowTrigger: string;
    definition: WorkflowDefinition;
    now?: Date;
  },
) {
  const settings = await getOrCreateAgentOtherSettings(db, input);
  const blockDelay = blockAutoCloseMinutes(input.definition, input.workflowBlockId);
  const usesBrandPolicy = blockDelay === null;
  if (
    usesBrandPolicy &&
    !workflowTriggerMatchesAgentSetting(input.workflowTrigger, settings.abandonedWorkflowTriggers)
  ) {
    return null;
  }
  const basis = await latestPublicMessage(db, input.conversationId);
  return createAutoCloseJob(db, {
    ...input,
    kind: "workflow_abandoned",
    policySource: usesBrandPolicy ? "brand" : "block",
    dedupeKey: `workflow:${input.workflowRunId}:${input.workflowBlockId}:${basis?.id ?? "empty"}`,
    delayMinutes: blockDelay ?? settings.abandonedWorkflowDelayMinutes,
  });
}

export async function cancelPendingConversationAutoCloseJobs(
  db: KeenaiDb,
  input: {
    orgId: string;
    conversationId: string;
    reason: string;
    kinds?: Array<"resolved" | "workflow_abandoned">;
    workflowRunId?: string;
    now?: Date;
  },
): Promise<number> {
  const now = input.now ?? new Date();
  const filters = [
    eq(conversationAutoCloseJobs.orgId, input.orgId),
    eq(conversationAutoCloseJobs.conversationId, input.conversationId),
    inArray(conversationAutoCloseJobs.status, [...ACTIVE_JOB_STATUSES]),
  ];
  if (input.kinds?.length) filters.push(inArray(conversationAutoCloseJobs.kind, input.kinds));
  if (input.workflowRunId) {
    filters.push(eq(conversationAutoCloseJobs.workflowRunId, input.workflowRunId));
  }
  const cancelled = await db
    .update(conversationAutoCloseJobs)
    .set({ status: "cancelled", reason: input.reason, cancelledAt: now, updatedAt: now })
    .where(and(...filters))
    .returning({ id: conversationAutoCloseJobs.id });
  if (cancelled.length > 0) {
    await db.insert(conversationEvents).values({
      orgId: input.orgId,
      conversationId: input.conversationId,
      eventType: "conversation.auto_close_cancelled",
      actorType: "system",
      payload: { reason: input.reason, count: cancelled.length },
    });
  }
  return cancelled.length;
}

export async function reconcileAutoCloseJobsForSettings(
  db: KeenaiDb,
  settings: {
    orgId: string;
    brandId: string;
    autoCloseResolvedEnabled: boolean;
    autoCloseResolvedDelayMinutes: number;
    abandonedWorkflowTriggers: AgentAbandonedWorkflowTrigger[];
    abandonedWorkflowDelayMinutes: number;
  },
  now = new Date(),
) {
  const jobs = await db
    .select()
    .from(conversationAutoCloseJobs)
    .where(
      and(
        eq(conversationAutoCloseJobs.orgId, settings.orgId),
        eq(conversationAutoCloseJobs.brandId, settings.brandId),
        eq(conversationAutoCloseJobs.status, "pending"),
        eq(conversationAutoCloseJobs.policySource, "brand"),
      ),
    );
  let updated = 0;
  let cancelled = 0;
  for (const job of jobs) {
    const enabled =
      job.kind === "resolved"
        ? settings.autoCloseResolvedEnabled
        : workflowTriggerMatchesAgentSetting(
            job.workflowTrigger ?? "",
            settings.abandonedWorkflowTriggers,
          );
    if (!enabled) {
      await db
        .update(conversationAutoCloseJobs)
        .set({
          status: "cancelled",
          reason: "settings_disabled",
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(conversationAutoCloseJobs.id, job.id));
      await db.insert(conversationEvents).values({
        orgId: job.orgId,
        conversationId: job.conversationId,
        eventType: "conversation.auto_close_cancelled",
        actorType: "system",
        payload: { jobId: job.id, reason: "settings_disabled" },
      });
      cancelled += 1;
      continue;
    }
    const delayMinutes =
      job.kind === "resolved"
        ? settings.autoCloseResolvedDelayMinutes
        : settings.abandonedWorkflowDelayMinutes;
    const dueAt = new Date(job.createdAt.getTime() + delayMinutes * 60_000);
    await db
      .update(conversationAutoCloseJobs)
      .set({ dueAt, updatedAt: now })
      .where(eq(conversationAutoCloseJobs.id, job.id));
    await db.insert(conversationEvents).values({
      orgId: job.orgId,
      conversationId: job.conversationId,
      eventType: "conversation.auto_close_rescheduled",
      actorType: "system",
      payload: { jobId: job.id, dueAt: dueAt.toISOString(), reason: "settings_changed" },
    });
    updated += 1;
  }
  return { updated, cancelled };
}

async function skipJob(db: KeenaiDb, jobId: string, reason: string, now: Date) {
  await db
    .update(conversationAutoCloseJobs)
    .set({ status: "skipped", reason, completedAt: now, updatedAt: now })
    .where(eq(conversationAutoCloseJobs.id, jobId));
  return { closed: false, reason };
}

async function runClaimedAutoCloseJob(
  db: KeenaiDb,
  job: typeof conversationAutoCloseJobs.$inferSelect,
  now: Date,
) {
  const [activeJob] = await db
    .select({ status: conversationAutoCloseJobs.status })
    .from(conversationAutoCloseJobs)
    .where(eq(conversationAutoCloseJobs.id, job.id))
    .limit(1);
  if (activeJob?.status !== "processing") return { closed: false, reason: "cancelled" };

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, job.conversationId), eq(conversations.orgId, job.orgId)))
    .limit(1);
  if (!conversation) return skipJob(db, job.id, "conversation_not_found", now);
  if (conversation.status !== "open") {
    return skipJob(db, job.id, `conversation_${conversation.status}`, now);
  }

  const latest = await latestPublicMessage(db, job.conversationId);
  if ((latest?.id ?? null) !== (job.basisMessageId ?? null)) {
    return skipJob(db, job.id, "newer_message", now);
  }

  const settings = await getOrCreateAgentOtherSettings(db, {
    orgId: job.orgId,
    brandId: job.brandId,
  });
  if (job.kind === "resolved") {
    if (!settings.autoCloseResolvedEnabled) {
      return skipJob(db, job.id, "settings_disabled", now);
    }
    if (job.agentRunId) {
      const [run] = await db
        .select({ status: agentRuns.status })
        .from(agentRuns)
        .where(and(eq(agentRuns.id, job.agentRunId), eq(agentRuns.orgId, job.orgId)))
        .limit(1);
      if (!run || run.status !== "completed") {
        return skipJob(db, job.id, "agent_run_not_completed", now);
      }
    }
  } else {
    if (
      job.policySource === "brand" &&
      !workflowTriggerMatchesAgentSetting(
        job.workflowTrigger ?? "",
        settings.abandonedWorkflowTriggers,
      )
    ) {
      return skipJob(db, job.id, "settings_disabled", now);
    }
    const [run] = job.workflowRunId
      ? await db
          .select({ status: workflowRuns.status })
          .from(workflowRuns)
          .where(and(eq(workflowRuns.id, job.workflowRunId), eq(workflowRuns.orgId, job.orgId)))
          .limit(1)
      : [];
    if (!run || run.status !== "awaiting_input") {
      return skipJob(db, job.id, "workflow_not_awaiting_input", now);
    }
  }

  const [stillActive] = await db
    .select({ status: conversationAutoCloseJobs.status })
    .from(conversationAutoCloseJobs)
    .where(eq(conversationAutoCloseJobs.id, job.id))
    .limit(1);
  if (stillActive?.status !== "processing") return { closed: false, reason: "cancelled" };

  const lastMessageGuard = job.basisLastMessageAt
    ? eq(conversations.lastMessageAt, job.basisLastMessageAt)
    : isNull(conversations.lastMessageAt);
  const [closed] = await db
    .update(conversations)
    .set({
      status: "closed",
      closedAt: now,
      snoozedUntil: null,
      attributes: markConversationAutoClosedAttributes(conversation.attributes ?? {}, {
        jobId: job.id,
        kind: job.kind,
        closedAt: now.toISOString(),
      }),
      updatedAt: now,
    })
    .where(
      and(
        eq(conversations.id, conversation.id),
        eq(conversations.orgId, job.orgId),
        eq(conversations.status, "open"),
        lastMessageGuard,
      ),
    )
    .returning();
  if (!closed) return skipJob(db, job.id, "conversation_changed", now);

  const completed = await db
    .update(conversationAutoCloseJobs)
    .set({ status: "completed", reason: null, completedAt: now, updatedAt: now })
    .where(
      and(
        eq(conversationAutoCloseJobs.id, job.id),
        eq(conversationAutoCloseJobs.status, "processing"),
      ),
    )
    .returning({ id: conversationAutoCloseJobs.id });
  if (completed.length === 0) return { closed: false, reason: "cancelled_after_close" };
  await db.insert(conversationEvents).values({
    orgId: job.orgId,
    conversationId: job.conversationId,
    eventType: "conversation.auto_closed",
    actorType: "system",
    payload: { jobId: job.id, kind: job.kind, policySource: job.policySource },
  });

  try {
    const { getKbDispatch } = await import("./kb-dispatch-init.js");
    const { dispatchKbConversationClosed } = await import("./kb-dispatch.js");
    await dispatchKbConversationClosed(getKbDispatch(), db, {
      orgId: job.orgId,
      brandId: job.brandId,
      conversationId: job.conversationId,
    });
  } catch {
    // KB crystallization must not make a completed close retry.
  }
  try {
    const { publishConversation } = await import("./conversation-bus.js");
    const { serializeConversation } = await import("./conversations.js");
    publishConversation({
      type: "conversation.updated",
      conversationId: closed.id,
      conversation: serializeConversation(closed),
    });
    const { getWorkflowDispatch } = await import("./workflow-dispatch.js");
    await getWorkflowDispatch().dispatchConversationTrigger({
      orgId: job.orgId,
      brandId: job.brandId,
      conversationId: job.conversationId,
      trigger: "conversation_state_changed",
      facts: {
        channelType: closed.channelType,
        priority: closed.priority ?? "normal",
        conversationStatus: "closed",
      },
    });
  } catch {
    // Notification and follow-up workflow dispatch are best effort.
  }
  return { closed: true };
}

export async function runDueConversationAutoCloseJobs(
  db: KeenaiDb,
  input?: { now?: Date; limit?: number },
) {
  const now = input?.now ?? new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  await db
    .update(conversationAutoCloseJobs)
    .set({ status: "pending", reason: "processing_recovered", updatedAt: now })
    .where(
      and(
        eq(conversationAutoCloseJobs.status, "processing"),
        lt(conversationAutoCloseJobs.updatedAt, staleBefore),
      ),
    );

  const due = await db
    .select()
    .from(conversationAutoCloseJobs)
    .where(
      and(
        eq(conversationAutoCloseJobs.status, "pending"),
        lte(conversationAutoCloseJobs.dueAt, now),
      ),
    )
    .orderBy(conversationAutoCloseJobs.dueAt)
    .limit(input?.limit ?? 100);
  let closed = 0;
  let skipped = 0;
  let failed = 0;
  for (const job of due) {
    const [claimed] = await db
      .update(conversationAutoCloseJobs)
      .set({
        status: "processing",
        attempts: sql`${conversationAutoCloseJobs.attempts} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(conversationAutoCloseJobs.id, job.id),
          eq(conversationAutoCloseJobs.status, "pending"),
        ),
      )
      .returning();
    if (!claimed) continue;
    try {
      const result = await runClaimedAutoCloseJob(db, claimed, now);
      if (result.closed) closed += 1;
      else skipped += 1;
    } catch (error) {
      const exhausted = claimed.attempts >= MAX_JOB_ATTEMPTS;
      await db
        .update(conversationAutoCloseJobs)
        .set({
          status: exhausted ? "failed" : "pending",
          reason: error instanceof Error ? error.message.slice(0, 500) : "auto_close_failed",
          dueAt: exhausted ? claimed.dueAt : new Date(now.getTime() + 60_000),
          updatedAt: now,
        })
        .where(eq(conversationAutoCloseJobs.id, claimed.id));
      failed += 1;
    }
  }
  return { scanned: due.length, closed, skipped, failed };
}
