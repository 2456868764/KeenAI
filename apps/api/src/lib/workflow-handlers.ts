import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, members, teamMembers, type workflows } from "@keenai/storage/schema";
import type {
  AssignInput,
  AssignResult,
  CollectDataInput,
  CsatInput,
  MarkPriorityInput,
  ReplyButtonsInput,
  ShowExpectedReplyTimeInput,
  SnoozeInput,
  TagConversationInput,
  WorkflowActionHandlers,
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowStepResult,
} from "@keenai/workflow";
import { and, eq, inArray, sql } from "drizzle-orm";
import { buildMessageContent, insertMessage } from "./conversations.js";
import { buildEmailSendJob, dispatchEmailOutbound } from "./email-outbound.js";
import { getKbDispatch } from "./kb-dispatch-init.js";
import { dispatchKbConversationClosed } from "./kb-dispatch.js";
import {
  evaluateConversationSla,
  getOfficeHoursForOrg,
  isWithinOfficeHours,
  listSlaPolicies,
} from "./sla.js";
import { notifyTicketStatusChange } from "./ticket-notify.js";
import {
  createTicketFromConversation,
  getConversationTicketId,
  getTicketForOrg,
  linkTickets,
  listTicketStatusesForOrg,
  loadTicketMeta,
  transitionTicketStatus,
} from "./tickets.js";
import { runLetKeeniAnswerBlock } from "./workflow-keeni-answer.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];
type ConversationRow = typeof conversations.$inferSelect;
type WorkflowRow = typeof workflows.$inferSelect;

function parseWebhookPayload(payload: string | undefined): unknown {
  const trimmed = payload?.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function listActiveTeamMemberIds(db: Db, orgId: string, teamId: string): Promise<string[]> {
  const rows = await db
    .select({ memberId: teamMembers.memberId })
    .from(teamMembers)
    .innerJoin(members, eq(members.id, teamMembers.memberId))
    .where(
      and(eq(teamMembers.teamId, teamId), eq(members.orgId, orgId), eq(members.status, "active")),
    )
    .orderBy(teamMembers.memberId);
  return rows.map((row) => row.memberId);
}

async function openConversationCountsByAssignee(
  db: Db,
  orgId: string,
  memberIds: string[],
): Promise<Map<string, number>> {
  if (memberIds.length === 0) return new Map();
  const rows = await db
    .select({
      assigneeId: conversations.assigneeId,
      count: sql<number>`count(*)`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, orgId),
        eq(conversations.status, "open"),
        inArray(conversations.assigneeId, memberIds),
      ),
    )
    .groupBy(conversations.assigneeId);

  return new Map(
    rows.flatMap((row) => (row.assigneeId ? [[row.assigneeId, Number(row.count)]] : [])),
  );
}

async function resolveWorkflowAssignment(
  db: Db,
  workflow: WorkflowRow,
  conversation: ConversationRow,
  input: AssignInput,
): Promise<AssignResult> {
  if (input.strategy === "direct") {
    return input;
  }

  if (!input.teamId) throw new Error("assign_team_required");

  const memberIds = await listActiveTeamMemberIds(db, workflow.orgId, input.teamId);
  if (memberIds.length === 0) throw new Error("assign_team_members_missing");

  if (input.strategy === "round_robin") {
    const index = stableHash(conversation.id) % memberIds.length;
    return { ...input, assigneeId: memberIds[index] ?? null };
  }

  const counts = await openConversationCountsByAssignee(db, workflow.orgId, memberIds);
  const assigneeId = memberIds.reduce((best, candidate) => {
    const bestCount = counts.get(best) ?? 0;
    const candidateCount = counts.get(candidate) ?? 0;
    if (candidateCount < bestCount) return candidate;
    if (candidateCount === bestCount && candidate < best) return candidate;
    return best;
  }, memberIds[0] ?? "");

  return { ...input, assigneeId: assigneeId || null };
}

export function buildCollectDataMessageContent(input: CollectDataInput): Record<string, unknown> {
  return {
    type: "workflow_collect_data",
    text: input.prompt,
    workflow: {
      kind: "collect_data",
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      fields: input.fields,
      allowFreeText: input.allowFreeText,
    },
  };
}

export function buildReplyButtonsMessageContent(input: ReplyButtonsInput): Record<string, unknown> {
  return {
    type: "workflow_reply_buttons",
    text: input.prompt,
    workflow: {
      kind: "reply_buttons",
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      buttons: input.buttons.map((button) => ({ id: button.id, label: button.label })),
      allowFreeText: input.allowFreeText,
    },
  };
}

export function buildCsatMessageContent(input: CsatInput): Record<string, unknown> {
  return {
    type: "workflow_csat",
    text: input.prompt,
    workflow: {
      kind: "csat",
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      allowComment: input.allowComment,
      waitForRating: input.waitForRating,
    },
  };
}

export function mergeConversationTags(existing: string[], input: TagConversationInput): string[] {
  if (input.mode === "replace") return [...new Set(input.tags)];
  return [...new Set([...existing, ...input.tags])];
}

function formatReplyTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return `${days} business day${days === 1 ? "" : "s"}`;
}

function renderExpectedReplyTemplate(
  template: string,
  values: {
    replyTime: string;
    replyTimeMinutes: number;
    insideOfficeHours?: boolean;
    policyName?: string;
  },
): string {
  return template
    .replaceAll("{{replyTime}}", values.replyTime)
    .replaceAll("{{replyTimeMinutes}}", String(values.replyTimeMinutes))
    .replaceAll("{{insideOfficeHours}}", String(values.insideOfficeHours ?? "unknown"))
    .replaceAll("{{policyName}}", values.policyName ?? "Standard");
}

export async function resolveExpectedReplyTimeMessage(
  db: Db,
  orgId: string,
  input: ShowExpectedReplyTimeInput,
  now = new Date(),
) {
  const policies = await listSlaPolicies(db, orgId);
  const policy = input.policyId
    ? policies.find((candidate) => candidate.id === input.policyId && candidate.enabled)
    : policies.find((candidate) => candidate.enabled);

  if (input.policyId && !policy) throw new Error("sla_policy_not_found");

  const expectedReplyMinutes = Math.max(
    1,
    Math.ceil((policy?.firstResponseSec ?? input.fallbackMinutes * 60) / 60),
  );
  const hours = await getOfficeHoursForOrg(db, orgId);
  const insideOfficeHours = hours ? isWithinOfficeHours(hours, now) : undefined;
  const replyTime = formatReplyTime(expectedReplyMinutes);
  const template =
    insideOfficeHours === false
      ? (input.outsideOfficeHoursText ??
        "We are currently outside office hours. We usually reply within {{replyTime}} once we are back.")
      : (input.insideOfficeHoursText ?? "We usually reply within {{replyTime}}.");
  const plainText = renderExpectedReplyTemplate(template, {
    replyTime,
    replyTimeMinutes: expectedReplyMinutes,
    insideOfficeHours,
    policyName: policy?.name,
  });

  return {
    plainText,
    expectedReplyMinutes,
    insideOfficeHours,
    policyId: policy?.id,
    policyName: policy?.name,
  };
}

export function createWorkflowActionHandlers(
  db: Db,
  workflow: WorkflowRow,
  conversation: ConversationRow,
  env: ApiEnv,
  authConfig: AuthConfig | undefined,
  workflowRunId: string,
): WorkflowActionHandlers {
  const conversationId = conversation.id;

  return {
    sendMessage: async ({ plainText, attachmentIds }) => {
      const { message } = await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText,
        attachmentIds,
        content: plainText ? buildMessageContent(plainText) : undefined,
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
      });

      if (authConfig && (message.plainText.trim() || (attachmentIds?.length ?? 0) > 0)) {
        const job = await buildEmailSendJob(db, env, {
          orgId: workflow.orgId,
          conversationId,
          plainText: message.plainText,
          messageId: message.id,
        });
        if (job) {
          await dispatchEmailOutbound(db, env, authConfig, job);
        }
      }
    },
    addNote: async ({ plainText }) => {
      await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText,
        content: buildMessageContent(plainText),
        isInternal: true,
        sentVia: "workflow",
        isAgentReply: false,
        metadata: { source: "workflow_add_note", workflowId: workflow.id, workflowRunId },
      });
    },
    assign: async (input) => {
      const result = await resolveWorkflowAssignment(db, workflow, conversation, input);
      await db
        .update(conversations)
        .set({ assigneeId: result.assigneeId, teamId: result.teamId, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      return result;
    },
    close: async () => {
      await db
        .update(conversations)
        .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      try {
        await dispatchKbConversationClosed(getKbDispatch(), db, {
          orgId: workflow.orgId,
          brandId: conversation.brandId,
          conversationId,
        });
      } catch {
        // KB crystallize is best-effort on close
      }
    },
    reopen: async () => {
      await db
        .update(conversations)
        .set({
          status: "open",
          closedAt: null,
          snoozedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
    },
    showExpectedReplyTime: async (input) => {
      const result = await resolveExpectedReplyTimeMessage(db, workflow.orgId, input);
      const { message } = await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText: result.plainText,
        content: buildMessageContent(result.plainText),
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
        metadata: {
          source: "workflow_show_expected_reply_time",
          workflowId: workflow.id,
          workflowRunId,
        },
      });

      if (authConfig && message.plainText.trim()) {
        const job = await buildEmailSendJob(db, env, {
          orgId: workflow.orgId,
          conversationId,
          plainText: message.plainText,
          messageId: message.id,
        });
        if (job) {
          await dispatchEmailOutbound(db, env, authConfig, job);
        }
      }

      return result;
    },
    letKeeniAnswer: (input) => runLetKeeniAnswerBlock(db, env, input),
    convertToTicket: async ({ title }) => {
      const ticket = await createTicketFromConversation(db, {
        orgId: workflow.orgId,
        conversationId,
        title,
      });
      return { ticketId: ticket.id };
    },
    linkTicket: async ({ parentTicketId, childTicketId, linkType }) => {
      let parentId = parentTicketId;
      if (!parentId) {
        parentId = (await getConversationTicketId(db, workflow.orgId, conversationId)) ?? undefined;
        if (!parentId) throw new Error("conversation_ticket_missing");
      }
      const linked = await linkTickets(db, {
        orgId: workflow.orgId,
        parentId,
        childId: childTicketId,
        linkType,
      });
      if (!linked) throw new Error("link_failed");
      return { parentTicketId: parentId, childTicketId };
    },
    sendTicketUpdate: async ({ ticketId }) => {
      const resolvedId =
        ticketId ?? (await getConversationTicketId(db, workflow.orgId, conversationId));
      if (!resolvedId) throw new Error("ticket_not_found");
      const row = await getTicketForOrg(db, resolvedId, workflow.orgId);
      if (!row) throw new Error("ticket_not_found");
      const ticket = await loadTicketMeta(db, row);
      if (!ticket.statusName) throw new Error("ticket_status_missing");
      if (!authConfig) return { sent: false };
      const result = await notifyTicketStatusChange(db, authConfig, {
        orgId: workflow.orgId,
        ticket,
        statusName: ticket.statusName,
      });
      return { sent: result.sent };
    },
    setTicketState: async ({ ticketId, statusId, statusName }) => {
      const resolvedTicketId =
        ticketId ?? (await getConversationTicketId(db, workflow.orgId, conversationId));
      if (!resolvedTicketId) throw new Error("ticket_not_found");

      let resolvedStatusId = statusId;
      if (!resolvedStatusId && statusName) {
        const normalized = statusName.trim().toLowerCase();
        const statuses = await listTicketStatusesForOrg(db, workflow.orgId);
        resolvedStatusId = statuses.find((status) => status.name.toLowerCase() === normalized)?.id;
      }
      if (!resolvedStatusId) throw new Error("status_not_found");

      const ticket = await transitionTicketStatus(db, {
        orgId: workflow.orgId,
        ticketId: resolvedTicketId,
        statusId: resolvedStatusId,
      });
      if (!ticket) throw new Error("ticket_not_found");
      return {
        ticketId: ticket.id,
        statusId: ticket.statusId ?? resolvedStatusId,
        statusName: ticket.statusName,
      };
    },
    wait: async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    httpRequest: async ({ method, url, body }) => {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ?? undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      return { status: res.status, body: text.slice(0, 4000) };
    },
    webhookEmit: async ({ blockId, url, eventName, payload, headers }) => {
      const resolvedEventName = eventName?.trim() || "workflow.webhook_emit";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          event: resolvedEventName,
          payload: parseWebhookPayload(payload),
          context: {
            orgId: workflow.orgId,
            brandId: conversation.brandId,
            workflowId: workflow.id,
            workflowRunId,
            conversationId,
            blockId,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      return { status: res.status, body: text.slice(0, 4000), eventName: resolvedEventName };
    },
    applySla: async ({ policyId }) => {
      const result = await evaluateConversationSla(db, {
        orgId: workflow.orgId,
        conversationId,
        policyId,
      });
      if (policyId && !result.policyId) throw new Error("sla_policy_not_found");
      return {
        policyId: result.policyId,
        breachCount: result.breaches.length,
        skipped: result.skipped,
      };
    },
    collectData: async (input) => {
      await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText: input.prompt,
        content: buildCollectDataMessageContent({ ...input, workflowRunId }),
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
      });
    },
    replyButtons: async (input) => {
      await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText: input.prompt,
        content: buildReplyButtonsMessageContent({ ...input, workflowRunId }),
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
      });
    },
    disableCustomerReply: async (input) => {
      const [row] = await db
        .select({ attributes: conversations.attributes })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      const { workflowCustomerReplyDisabledReason: _previousReason, ...restAttributes } =
        row?.attributes ?? {};
      const nextAttributes = {
        ...restAttributes,
        workflowCustomerReplyDisabled: input.disabled,
        ...(input.disabled && input.reason
          ? { workflowCustomerReplyDisabledReason: input.reason }
          : {}),
      };

      await db
        .update(conversations)
        .set({ attributes: nextAttributes, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      return { disabled: input.disabled, reason: input.reason };
    },
    snooze: async ({ minutes }) => {
      const until = new Date(Date.now() + minutes * 60_000);
      await db
        .update(conversations)
        .set({ status: "snoozed", snoozedUntil: until, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    },
    csat: async (input) => {
      await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText: input.prompt,
        content: buildCsatMessageContent({ ...input, workflowRunId }),
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
      });
    },
    tagConversation: async (input) => {
      const [row] = await db
        .select({ tags: conversations.tags })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      const tags = mergeConversationTags(row?.tags ?? [], input);
      await db
        .update(conversations)
        .set({ tags, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    },
    markPriority: async ({ priority }: MarkPriorityInput) => {
      await db
        .update(conversations)
        .set({ priority, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    },
  };
}

export function createWorkflowRunContext(
  workflow: WorkflowRow,
  conversation: ConversationRow,
  workflowRunId: string,
): WorkflowRunContext {
  return {
    workflowId: workflow.id,
    workflowRunId,
    orgId: workflow.orgId,
    brandId: conversation.brandId,
    conversationId: conversation.id,
    targetCustomerId: conversation.userId,
    subject: conversation.subject ?? undefined,
    facts: {
      channelType: conversation.channelType,
      priority: conversation.priority ?? "normal",
      conversationStatus: conversation.status,
    },
  };
}

export function patchCollectDataStep(
  steps: WorkflowStepResult[],
  blockId: string,
  submission: { attributes: Record<string, string>; freeText?: string },
): WorkflowStepResult[] {
  return steps.map((step) => {
    if (step.blockId !== blockId || step.type !== "collect_data") return step;
    return {
      ...step,
      output: {
        ...step.output,
        awaitingInput: false,
        submittedAttributes: submission.attributes,
        freeText: submission.freeText,
      },
    };
  });
}

export function patchReplyButtonsStep(
  steps: WorkflowStepResult[],
  blockId: string,
  submission: { buttonId: string; buttonLabel: string; nextBlockId: string | null },
): WorkflowStepResult[] {
  return steps.map((step) => {
    if (step.blockId !== blockId || step.type !== "reply_buttons") return step;
    return {
      ...step,
      output: {
        ...step.output,
        awaitingInput: false,
        buttonId: submission.buttonId,
        buttonLabel: submission.buttonLabel,
        nextBlockId: submission.nextBlockId,
      },
    };
  });
}

export function patchCsatStep(
  steps: WorkflowStepResult[],
  blockId: string,
  submission: { rating: number; ratingComment?: string },
): WorkflowStepResult[] {
  return steps.map((step) => {
    if (step.blockId !== blockId || step.type !== "csat") return step;
    return {
      ...step,
      output: {
        ...step.output,
        awaitingInput: false,
        rating: submission.rating,
        ratingComment: submission.ratingComment,
      },
    };
  });
}

export function resolveActiveWorkflowDefinition(workflow: WorkflowRow): WorkflowDefinition {
  if (workflow.status === "published" && workflow.publishedDefinition) {
    return workflow.publishedDefinition as WorkflowDefinition;
  }
  return workflow.definition as WorkflowDefinition;
}
