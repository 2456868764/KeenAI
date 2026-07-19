import { z } from "zod";

const COLLECT_CUSTOMER_REPLY_AUTO_CLOSE_MINUTES = [1, 3, 5, 7, 10, 15, 30, 60] as const;

export const collectCustomerReplyBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("collect_customer_reply"),
  prompt: z.string().max(2000).optional(),
  bufferSeconds: z.number().int().min(0).max(30).default(2).optional(),
  autoCloseMinutes: z
    .number()
    .int()
    .refine((v) => (COLLECT_CUSTOMER_REPLY_AUTO_CLOSE_MINUTES as readonly number[]).includes(v), {
      message: "invalid_auto_close_minutes",
    })
    .optional(),
});

export type CollectCustomerReplyBlock = z.infer<typeof collectCustomerReplyBlockSchema>;

export type CollectCustomerReplyInput = {
  blockId: string;
  prompt?: string;
  workflowRunId?: string;
  bufferSeconds?: number;
  autoCloseMinutes?: number;
};

export type CollectCustomerReplySubmission = {
  messageId: string;
  plainText: string;
};
