import { z } from "zod";

export const csatBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("csat"),
  prompt: z.string().min(1).max(2000).default("How would you rate this conversation?"),
  allowComment: z.boolean().default(true),
  waitForRating: z.boolean().default(false),
  waitForRatingMinutes: z.number().int().min(1).max(10_080).optional(),
});

export type CsatBlock = z.infer<typeof csatBlockSchema>;

export type CsatInput = {
  blockId: string;
  prompt: string;
  allowComment: boolean;
  workflowRunId?: string;
  waitForRating: boolean;
  waitForRatingMinutes?: number;
};

export type CsatSubmission = {
  rating: number;
  ratingComment?: string;
};
