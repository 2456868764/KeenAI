import { z } from "zod";
import { branchesBlockSchema } from "./blocks/branches.js";
import { convertToTicketBlockSchema } from "./blocks/convert-to-ticket.js";
import {
  type LetKeeniAnswerInput,
  type LetKeeniAnswerResult,
  letKeeniAnswerBlockSchema,
} from "./blocks/let-keeni-answer.js";

export {
  branchConditionSchema,
  branchesBlockSchema,
  evaluateBranchCondition,
  resolveBranchesNext,
  type BranchCondition,
  type BranchesBlock,
  type WorkflowFacts,
} from "./blocks/branches.js";
export {
  convertToTicketBlockSchema,
  type ConvertToTicketBlock,
} from "./blocks/convert-to-ticket.js";
export {
  letKeeniAnswerBlockSchema,
  letKeeniAnswerOutcomeRoutingSchema,
  resolveLetKeeniAnswerNext,
  type LetKeeniAnswerBlock,
  type LetKeeniAnswerInput,
  type LetKeeniAnswerOutcomeRouting,
  type LetKeeniAnswerResult,
} from "./blocks/let-keeni-answer.js";

export const WORKFLOW_TRIGGERS = ["first_message", "customer_unresponsive"] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

export const WORKFLOW_STATUSES = ["draft", "published"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_BLOCK_TYPES = [
  "send_message",
  "assign",
  "close",
  "let_keeni_answer",
  "wait",
  "http_request",
  "branches",
  "convert_to_ticket",
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
  letKeeniAnswerBlockSchema,
  waitBlockSchema,
  httpRequestBlockSchema,
  branchesBlockSchema,
  convertToTicketBlockSchema,
]);

export const workflowDefinitionSchema = z
  .object({
    trigger: z.enum(WORKFLOW_TRIGGERS),
    /** Minutes of customer silence after agent reply (customer_unresponsive only). */
    inactivityMinutes: z.number().int().min(0).max(20_160).optional(),
    blocks: z.array(workflowBlockSchema).min(1).max(32),
  })
  .superRefine((val, ctx) => {
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
  assign: (assigneeId: string | null) => Promise<void>;
  close: () => Promise<void>;
  letKeeniAnswer?: (input: LetKeeniAnswerInput) => Promise<LetKeeniAnswerResult>;
  wait?: (milliseconds: number) => Promise<void>;
  httpRequest?: (input: HttpRequestInput) => Promise<HttpRequestResult>;
  convertToTicket?: (input: { title?: string }) => Promise<{ ticketId: string }>;
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
    branchLabel?: string;
  };
};

export type WorkflowRunResult = {
  steps: WorkflowStepResult[];
};
