import { z } from "zod";
import { applyRulesBlockSchema } from "./blocks/apply-rules.js";
import {
  type ApplySlaInput,
  type ApplySlaResult,
  applySlaBlockSchema,
} from "./blocks/apply-sla.js";
import { branchesBlockSchema } from "./blocks/branches.js";
import {
  type CollectCustomerReplyInput,
  collectCustomerReplyBlockSchema,
} from "./blocks/collect-customer-reply.js";
import { type CollectDataInput, collectDataBlockSchema } from "./blocks/collect-data.js";
import { convertToTicketBlockSchema } from "./blocks/convert-to-ticket.js";
import { type CsatInput, csatBlockSchema } from "./blocks/csat.js";
import {
  type DisableCustomerReplyInput,
  type DisableCustomerReplyResult,
  disableCustomerReplyBlockSchema,
} from "./blocks/disable-customer-reply.js";
import { endBlockSchema } from "./blocks/end.js";
import { gotoBlockSchema } from "./blocks/goto.js";
import {
  type LetKeeniAnswerInput,
  type LetKeeniAnswerResult,
  letKeeniAnswerBlockSchema,
} from "./blocks/let-keeni-answer.js";
import { linkTicketBlockSchema } from "./blocks/link-ticket.js";
import { type MarkPriorityInput, markPriorityBlockSchema } from "./blocks/mark-priority.js";
import { reopenBlockSchema } from "./blocks/reopen.js";
import { type ReplyButtonsInput, replyButtonsBlockSchema } from "./blocks/reply-buttons.js";
import { sendTicketUpdateBlockSchema } from "./blocks/send-ticket-update.js";
import {
  type SetTicketStateInput,
  type SetTicketStateResult,
  setTicketStateBlockObjectSchema,
  setTicketStateBlockSchema,
} from "./blocks/set-ticket-state.js";
import {
  type ShowExpectedReplyTimeInput,
  type ShowExpectedReplyTimeResult,
  showExpectedReplyTimeBlockSchema,
} from "./blocks/show-expected-reply-time.js";
import { type SnoozeInput, snoozeBlockSchema } from "./blocks/snooze.js";
import {
  type TagConversationInput,
  tagConversationBlockSchema,
} from "./blocks/tag-conversation.js";
import {
  type TagEndUserInput,
  type TagEndUserResult,
  tagEndUserBlockSchema,
} from "./blocks/tag-end-user.js";
import {
  type WebhookEmitInput,
  type WebhookEmitResult,
  webhookEmitBlockSchema,
} from "./blocks/webhook-emit.js";

export {
  applySlaBlockSchema,
  type ApplySlaBlock,
  type ApplySlaInput,
  type ApplySlaResult,
} from "./blocks/apply-sla.js";
export {
  applyRulesBlockSchema,
  resolveApplyRulesMatches,
  type ApplyRulesBlock,
} from "./blocks/apply-rules.js";
export {
  evaluateBranchCondition,
  resolveBranchesNext,
  type BranchCondition,
  type BranchesBlock,
  type WorkflowFacts,
} from "./blocks/branches.js";
export {
  collectCustomerReplyBlockSchema,
  type CollectCustomerReplyBlock,
  type CollectCustomerReplyInput,
  type CollectCustomerReplySubmission,
} from "./blocks/collect-customer-reply.js";
export {
  collectDataBlockSchema,
  type CollectDataBlock,
  type CollectDataField,
  type CollectDataInput,
  type CollectDataSubmission,
} from "./blocks/collect-data.js";
export {
  convertToTicketBlockSchema,
  type ConvertToTicketBlock,
} from "./blocks/convert-to-ticket.js";
export {
  disableCustomerReplyBlockSchema,
  type DisableCustomerReplyBlock,
  type DisableCustomerReplyInput,
  type DisableCustomerReplyResult,
} from "./blocks/disable-customer-reply.js";
export {
  endBlockSchema,
  type EndBlock,
} from "./blocks/end.js";
export {
  gotoBlockSchema,
  type GotoBlock,
} from "./blocks/goto.js";
export {
  replyButtonsBlockSchema,
  resolveReplyButtonsNext,
  type ReplyButton,
  type ReplyButtonsBlock,
  type ReplyButtonsInput,
  type ReplyButtonsSubmission,
} from "./blocks/reply-buttons.js";
export {
  reopenBlockSchema,
  type ReopenBlock,
} from "./blocks/reopen.js";
export {
  linkTicketBlockSchema,
  TICKET_LINK_TYPES,
  type LinkTicketBlock,
} from "./blocks/link-ticket.js";
export {
  markPriorityBlockSchema,
  WORKFLOW_PRIORITIES,
  type MarkPriorityBlock,
  type MarkPriorityInput,
  type WorkflowPriority,
} from "./blocks/mark-priority.js";
export {
  csatBlockSchema,
  type CsatBlock,
  type CsatInput,
  type CsatSubmission,
} from "./blocks/csat.js";
export {
  snoozeBlockSchema,
  type SnoozeBlock,
  type SnoozeInput,
} from "./blocks/snooze.js";
export {
  tagEndUserBlockSchema,
  type TagEndUserBlock,
  type TagEndUserInput,
  type TagEndUserResult,
} from "./blocks/tag-end-user.js";
export {
  tagConversationBlockSchema,
  type TagConversationBlock,
  type TagConversationInput,
} from "./blocks/tag-conversation.js";
export {
  webhookEmitBlockSchema,
  type WebhookEmitBlock,
  type WebhookEmitInput,
  type WebhookEmitResult,
} from "./blocks/webhook-emit.js";
export {
  sendTicketUpdateBlockSchema,
  type SendTicketUpdateBlock,
} from "./blocks/send-ticket-update.js";
export {
  setTicketStateBlockSchema,
  type SetTicketStateBlock,
  type SetTicketStateInput,
  type SetTicketStateResult,
} from "./blocks/set-ticket-state.js";
export {
  showExpectedReplyTimeBlockSchema,
  type ShowExpectedReplyTimeBlock,
  type ShowExpectedReplyTimeInput,
  type ShowExpectedReplyTimeResult,
} from "./blocks/show-expected-reply-time.js";
export {
  letKeeniAnswerBlockSchema,
  letKeeniAnswerOutcomeRoutingSchema,
  resolveLetKeeniAnswerNext,
  type LetKeeniAnswerBlock,
  type LetKeeniAnswerInput,
  type LetKeeniAnswerOutcomeRouting,
  type LetKeeniAnswerResult,
} from "./blocks/let-keeni-answer.js";

export const WORKFLOW_TRIGGERS = [
  "page_view",
  "new_messenger_conversation",
  "first_message",
  "any_message",
  "teammate_message",
  "conversation_state_changed",
  "assigned_to_team",
  "assigned_to_member",
  "customer_unresponsive",
  "teammate_unresponsive",
  "teammate_added_note",
  "ticket_created",
  "ticket_state_changed",
  "schedule",
  "webhook",
  "event_match",
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

export const WORKFLOW_STATUSES = ["draft", "published"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_BLOCK_TYPES = [
  "send_message",
  "assign",
  "close",
  "reopen",
  "end",
  "goto",
  "show_expected_reply_time",
  "let_keeni_answer",
  "wait",
  "http_request",
  "webhook_emit",
  "branches",
  "apply_rules",
  "apply_sla",
  "convert_to_ticket",
  "link_ticket",
  "send_ticket_update",
  "set_ticket_state",
  "collect_data",
  "collect_customer_reply",
  "reply_buttons",
  "disable_customer_reply",
  "snooze",
  "csat",
  "tag_end_user",
  "tag_conversation",
  "add_note",
  "mark_priority",
] as const;
export type WorkflowBlockType = (typeof WORKFLOW_BLOCK_TYPES)[number];

const sendMessageBlockObjectSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("send_message"),
  plainText: z.string().max(10_000).optional(),
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
});

export const sendMessageBlockSchema = sendMessageBlockObjectSchema.refine(
  (val) => (val.plainText?.trim() ?? "").length > 0 || (val.attachmentIds?.length ?? 0) > 0,
  { message: "plainText_or_attachmentIds_required", path: ["plainText"] },
);

export const assignBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("assign"),
  assigneeId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  strategy: z.enum(["direct", "round_robin", "least_busy"]).optional(),
});

export const closeBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("close"),
});

export const addNoteBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("add_note"),
  plainText: z.string().min(1).max(10_000),
});

export const waitBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("wait"),
  seconds: z.number().int().min(1).max(86_400),
});

export const httpRequestBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("http_request"),
  method: z.enum(["GET", "POST"]).default("GET"),
  url: z.string().url(),
  body: z.string().max(10_000).optional(),
});

export const workflowBlockSchema = z.discriminatedUnion("type", [
  sendMessageBlockObjectSchema,
  assignBlockSchema,
  closeBlockSchema,
  reopenBlockSchema,
  endBlockSchema,
  gotoBlockSchema,
  showExpectedReplyTimeBlockSchema,
  letKeeniAnswerBlockSchema,
  waitBlockSchema,
  httpRequestBlockSchema,
  webhookEmitBlockSchema,
  branchesBlockSchema,
  applyRulesBlockSchema,
  applySlaBlockSchema,
  convertToTicketBlockSchema,
  linkTicketBlockSchema,
  sendTicketUpdateBlockSchema,
  setTicketStateBlockObjectSchema,
  collectDataBlockSchema,
  collectCustomerReplyBlockSchema,
  replyButtonsBlockSchema,
  disableCustomerReplyBlockSchema,
  snoozeBlockSchema,
  csatBlockSchema,
  tagEndUserBlockSchema,
  tagConversationBlockSchema,
  addNoteBlockSchema,
  markPriorityBlockSchema,
]);

export const pageViewRuleSchema = z.object({
  urlOp: z.enum(["contains", "eq", "matches"]),
  url: z.string().min(1).max(2048),
  timeOnPageSec: z.number().int().min(0).max(86_400).optional(),
});

export const workflowAudienceRuleSchema = z.object({
  field: z.string().min(1).max(128),
  op: z.enum([
    "eq",
    "ne",
    "in",
    "nin",
    "contains",
    "starts_with",
    "ends_with",
    "matches",
    "exists",
  ]),
  value: z.unknown().optional(),
});

export const workflowAudienceSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(workflowAudienceRuleSchema).max(32).default([]),
});

export const workflowDefinitionSchema = z
  .object({
    trigger: z.enum(WORKFLOW_TRIGGERS),
    /** Minutes of customer silence after agent reply (customer_unresponsive only). */
    inactivityMinutes: z.number().int().min(0).max(20_160).optional(),
    /** Page URL rules for page_view workflows. Empty or omitted means every page view. */
    pageRules: z.array(pageViewRuleSchema).max(16).optional(),
    /** Custom event name for event_match workflows, e.g. app/subscription.churned. */
    eventName: z.string().min(1).max(128).optional(),
    /** Schedule cron for schedule workflows. */
    cron: z.string().min(1).max(64).optional(),
    /** Audience rules for schedule workflows. Empty or omitted means every open conversation. */
    audience: workflowAudienceSchema.optional(),
    blocks: z.array(workflowBlockSchema).min(1).max(32),
  })
  .superRefine((val, ctx) => {
    if (val.trigger === "schedule" && !val.cron?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cron_required",
        path: ["cron"],
      });
    }

    if (val.trigger === "event_match" && !val.eventName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "eventName_required",
        path: ["eventName"],
      });
    }

    val.blocks.forEach((block, index) => {
      if (block.type === "goto") {
        const targetExists = val.blocks.some((candidate) => candidate.id === block.targetBlockId);
        if (!targetExists) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "goto_target_not_found",
            path: ["blocks", index, "targetBlockId"],
          });
        }
      }

      if (block.type === "set_ticket_state" && !block.statusId && !block.statusName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "statusId_or_statusName_required",
          path: ["blocks", index, "statusId"],
        });
      }

      if (block.type !== "send_message") return;
      const text = block.plainText?.trim() ?? "";
      const attachments = block.attachmentIds?.length ?? 0;
      if (!text && attachments === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "plainText_or_attachmentIds_required",
          path: ["blocks", index, "plainText"],
        });
      }
    });
  });

export type WorkflowBlock = z.infer<typeof workflowBlockSchema>;
export type AddNoteBlock = z.infer<typeof addNoteBlockSchema>;
export type PageViewRule = z.infer<typeof pageViewRuleSchema>;
export type WorkflowAudience = z.infer<typeof workflowAudienceSchema>;
export type WorkflowAudienceRule = z.infer<typeof workflowAudienceRuleSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const createWorkflowBodySchema = z.object({
  name: z.string().min(1).max(128),
  brandId: z.string().optional(),
  definition: workflowDefinitionSchema,
});

export const updateWorkflowBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  definition: workflowDefinitionSchema.optional(),
});

export type WorkflowRunContext = {
  workflowId: string;
  workflowRunId?: string;
  orgId: string;
  brandId: string;
  conversationId: string;
  targetCustomerId?: string | null;
  subject?: string;
  isShadowRun?: boolean;
  facts?: import("./blocks/branches.js").WorkflowFacts;
};

export type SendMessageInput = {
  plainText?: string;
  attachmentIds?: string[];
};

export type HttpRequestInput = {
  method: "GET" | "POST";
  url: string;
  body?: string;
};

export type HttpRequestResult = {
  status: number;
  body: string;
};

export type AssignInput = {
  assigneeId: string | null;
  teamId: string | null;
  strategy: "direct" | "round_robin" | "least_busy";
};

export type AssignResult = {
  assigneeId: string | null;
  teamId: string | null;
  strategy: AssignInput["strategy"];
};

export type WorkflowActionHandlers = {
  sendMessage: (input: SendMessageInput) => Promise<void>;
  addNote?: (input: { plainText: string }) => Promise<void>;
  assign: (input: AssignInput) => Promise<AssignResult | undefined>;
  close: () => Promise<void>;
  reopen?: () => Promise<void>;
  showExpectedReplyTime?: (
    input: ShowExpectedReplyTimeInput,
  ) => Promise<ShowExpectedReplyTimeResult>;
  letKeeniAnswer?: (input: LetKeeniAnswerInput) => Promise<LetKeeniAnswerResult>;
  wait?: (milliseconds: number) => Promise<void>;
  httpRequest?: (input: HttpRequestInput) => Promise<HttpRequestResult>;
  webhookEmit?: (input: WebhookEmitInput) => Promise<WebhookEmitResult>;
  applySla?: (input: ApplySlaInput) => Promise<ApplySlaResult>;
  convertToTicket?: (input: { title?: string }) => Promise<{ ticketId: string }>;
  linkTicket?: (input: {
    parentTicketId?: string;
    childTicketId: string;
    linkType: "tracks" | "relates" | "blocks";
  }) => Promise<{ parentTicketId: string; childTicketId: string }>;
  sendTicketUpdate?: (input: { ticketId?: string }) => Promise<{ sent: boolean }>;
  setTicketState?: (input: SetTicketStateInput) => Promise<SetTicketStateResult>;
  collectData?: (input: CollectDataInput) => Promise<void>;
  collectCustomerReply?: (input: CollectCustomerReplyInput) => Promise<void>;
  replyButtons?: (input: ReplyButtonsInput) => Promise<void>;
  disableCustomerReply?: (input: DisableCustomerReplyInput) => Promise<DisableCustomerReplyResult>;
  snooze?: (input: SnoozeInput) => Promise<void>;
  csat?: (input: CsatInput) => Promise<void>;
  tagEndUser?: (input: TagEndUserInput) => Promise<TagEndUserResult>;
  tagConversation?: (input: TagConversationInput) => Promise<void>;
  markPriority?: (input: MarkPriorityInput) => Promise<void>;
};

export type WorkflowStepResult = {
  blockId: string;
  type: WorkflowBlockType;
  status: "ok" | "error";
  error?: string;
  output?: {
    replyText?: string;
    resolutionType?: string;
    nextBlockId?: string | null;
    expectedReplyMinutes?: number;
    insideOfficeHours?: boolean;
    policyName?: string;
    httpStatus?: number;
    webhookEventName?: string;
    waitMs?: number;
    slaPolicyId?: string;
    slaBreachCount?: number;
    slaSkipped?: string;
    ticketId?: string;
    matchedBranches?: string[];
    branchLabel?: string;
    parentTicketId?: string;
    childTicketId?: string;
    statusId?: string;
    statusName?: string | null;
    notificationSent?: boolean;
    assigneeId?: string | null;
    teamId?: string | null;
    assignStrategy?: AssignInput["strategy"];
    awaitingInput?: boolean;
    submittedAttributes?: Record<string, string>;
    freeText?: string;
    customerReplyMessageId?: string;
    customerReplyText?: string;
    bufferSeconds?: number;
    buttonId?: string;
    buttonLabel?: string;
    rating?: number;
    ratingComment?: string;
    customerReplyDisabled?: boolean;
    snoozeMinutes?: number;
    ratingRequested?: boolean;
    tags?: string[];
    tagMode?: "append" | "replace";
    targetCustomerId?: string;
    taggedConversationCount?: number;
    priority?: MarkPriorityInput["priority"];
  };
};

export type WorkflowSuspendedState =
  | { blockId: string; type: "collect_data" }
  | { blockId: string; type: "collect_customer_reply" }
  | { blockId: string; type: "reply_buttons" }
  | { blockId: string; type: "csat" };

export type WorkflowRunResult = {
  steps: WorkflowStepResult[];
  suspended?: WorkflowSuspendedState;
};
