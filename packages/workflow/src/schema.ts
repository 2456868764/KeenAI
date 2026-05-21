import { z } from "zod";

export const WORKFLOW_TRIGGERS = ["first_message", "customer_unresponsive"] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

export const WORKFLOW_STATUSES = ["draft", "published"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_BLOCK_TYPES = ["send_message", "assign", "close"] as const;
export type WorkflowBlockType = (typeof WORKFLOW_BLOCK_TYPES)[number];

export const sendMessageBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("send_message"),
  plainText: z.string().min(1).max(10_000),
});

export const assignBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("assign"),
  assigneeId: z.string().nullable().optional(),
});

export const closeBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("close"),
});

export const workflowBlockSchema = z.discriminatedUnion("type", [
  sendMessageBlockSchema,
  assignBlockSchema,
  closeBlockSchema,
]);

export const workflowDefinitionSchema = z.object({
  trigger: z.enum(WORKFLOW_TRIGGERS),
  /** Minutes of customer silence after agent reply (customer_unresponsive only). */
  inactivityMinutes: z.number().int().min(0).max(20_160).optional(),
  blocks: z.array(workflowBlockSchema).min(1).max(32),
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
};

export type WorkflowActionHandlers = {
  sendMessage: (plainText: string) => Promise<void>;
  assign: (assigneeId: string | null) => Promise<void>;
  close: () => Promise<void>;
};

export type WorkflowStepResult = {
  blockId: string;
  type: WorkflowBlockType;
  status: "ok" | "error";
  error?: string;
};

export type WorkflowRunResult = {
  steps: WorkflowStepResult[];
};
