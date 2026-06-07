import { z } from "zod";

const REPLY_BUTTONS_AUTO_CLOSE_MINUTES = [1, 3, 5, 7, 10, 15, 30, 60] as const;

export const replyButtonSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  nextId: z.string().min(1).max(64).nullable(),
});

export const replyButtonsBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("reply_buttons"),
  prompt: z.string().min(1).max(2000),
  allowFreeText: z.boolean().default(false),
  buttons: z.array(replyButtonSchema).min(1).max(8),
  autoCloseMinutes: z
    .number()
    .int()
    .refine((v) => (REPLY_BUTTONS_AUTO_CLOSE_MINUTES as readonly number[]).includes(v), {
      message: "invalid_auto_close_minutes",
    })
    .optional(),
});

export type ReplyButtonsBlock = z.infer<typeof replyButtonsBlockSchema>;
export type ReplyButton = z.infer<typeof replyButtonSchema>;

export type ReplyButtonsInput = {
  blockId: string;
  prompt: string;
  allowFreeText: boolean;
  buttons: ReplyButton[];
  workflowRunId?: string;
  autoCloseMinutes?: number;
};

export type ReplyButtonsSubmission = {
  buttonId: string;
};

export function resolveReplyButtonsNext(block: ReplyButtonsBlock, buttonId: string): string | null {
  const button = block.buttons.find((item) => item.id === buttonId);
  return button?.nextId ?? null;
}
