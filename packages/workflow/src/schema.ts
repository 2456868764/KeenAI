import { z } from "zod";
import { applyRulesBlockSchema } from "./blocks/apply-rules.js";
import { branchesBlockSchema } from "./blocks/branches.js";
import { type CollectDataInput, collectDataBlockSchema } from "./blocks/collect-data.js";
import { convertToTicketBlockSchema } from "./blocks/convert-to-ticket.js";
import { type CsatInput, csatBlockSchema } from "./blocks/csat.js";
import { endBlockSchema } from "./blocks/end.js";
import {
  type LetKeeniAnswerInput,
  type LetKeeniAnswerResult,
  letKeeniAnswerBlockSchema,
} from "./blocks/let-keeni-answer.js";
import { linkTicketBlockSchema } from "./blocks/link-ticket.js";
import { type MarkPriorityInput, markPriorityBlockSchema } from "./blocks/mark-priority.js";
import { type ReplyButtonsInput, replyButtonsBlockSchema } from "./blocks/reply-buttons.js";
import { sendTicketUpdateBlockSchema } from "./blocks/send-ticket-update.js";
import { type SnoozeInput, snoozeBlockSchema } from "./blocks/snooze.js";
import {
  type TagConversationInput,
  tagConversationBlockSchema,
} from "./blocks/tag-conversation.js";

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
  endBlockSchema,
  type EndBlock,
} from "./blocks/end.js";
export {
  replyButtonsBlockSchema,
  resolveReplyButtonsNext,
  type ReplyButton,
  type ReplyButtonsBlock,
  type ReplyButtonsInput,
  type ReplyButtonsSubmission,
} from "./blocks/reply-buttons.js";
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
  tagConversationBlockSchema,
  type TagConversationBlock,
  type TagConversationInput,
} from "./blocks/tag-conversation.js";
export {
  sendTicketUpdateBlockSchema,
  type SendTicketUpdateBlock,
} from "./blocks/send-ticket-update.js";
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
  "end",
  "let_keeni_answer",
  "wait",
  "http_request",
  "branches",
  "apply_rules",
  "convert_to_ticket",
  "link_ticket",
  "send_ticket_update",
  "collect_data",
  "reply_buttons",
  "snooze",
  "csat",
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
  endBlockSchema,
  letKeeniAnswerBlockSchema,
  waitBlockSchema,
  httpRequestBlockSchema,
  branchesBlockSchema,
  applyRulesBlockSchema,
  convertToTicketBlockSchema,
  linkTicketBlockSchema,
  sendTicketUpdateBlockSchema,
  collectDataBlockSchema,
  replyButtonsBlockSchema,
  snoozeBlockSchema,
  csatBlockSchema,
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

export type WorkflowActionHandlers = {
  sendMessage: (input: SendMessageInput) => Promise<void>;
  addNote?: (input: { plainText: string }) => Promise<void>;
  assign: (assigneeId: string | null) => Promise<void>;
  close: () => Promise<void>;
  letKeeniAnswer?: (input: LetKeeniAnswerInput) => Promise<LetKeeniAnswerResult>;
  wait?: (milliseconds: number) => Promise<void>;
  httpRequest?: (input: HttpRequestInput) => Promise<HttpRequestResult>;
  convertToTicket?: (input: { title?: string }) => Promise<{ ticketId: string }>;
  linkTicket?: (input: {
    parentTicketId?: string;
    childTicketId: string;
    linkType: "tracks" | "relates" | "blocks";
  }) => Promise<{ parentTicketId: string; childTicketId: string }>;
  sendTicketUpdate?: (input: { ticketId?: string }) => Promise<{ sent: boolean }>;
  collectData?: (input: CollectDataInput) => Promise<void>;
  replyButtons?: (input: ReplyButtonsInput) => Promise<void>;
  snooze?: (input: SnoozeInput) => Promise<void>;
  csat?: (input: CsatInput) => Promise<void>;
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
    httpStatus?: number;
    waitMs?: number;
    ticketId?: string;
    matchedBranches?: string[];
    branchLabel?: string;
    parentTicketId?: string;
    childTicketId?: string;
    notificationSent?: boolean;
    awaitingInput?: boolean;
    submittedAttributes?: Record<string, string>;
    freeText?: string;
    buttonId?: string;
    buttonLabel?: string;
    rating?: number;
    ratingComment?: string;
    snoozeMinutes?: number;
    ratingRequested?: boolean;
    tags?: string[];
    tagMode?: "append" | "replace";
    priority?: MarkPriorityInput["priority"];
  };
};

export type WorkflowSuspendedState =
  | { blockId: string; type: "collect_data" }
  | { blockId: string; type: "reply_buttons" }
  | { blockId: string; type: "csat" };

export type WorkflowRunResult = {
  steps: WorkflowStepResult[];
  suspended?: WorkflowSuspendedState;
};
