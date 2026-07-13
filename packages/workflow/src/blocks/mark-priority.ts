import { z } from "zod";

export const WORKFLOW_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const markPriorityBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("mark_priority"),
  priority: z.enum(WORKFLOW_PRIORITIES),
});

export type WorkflowPriority = (typeof WORKFLOW_PRIORITIES)[number];
export type MarkPriorityBlock = z.infer<typeof markPriorityBlockSchema>;

export type MarkPriorityInput = {
  priority: WorkflowPriority;
};
