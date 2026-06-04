import { z } from "zod";

export const kbSearchQuerySchema = z.object({
  brandId: z.string().min(1),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /** Set `false` to skip bge-reranker (KB-08). Defaults to true. */
  rerank: z.coerce.boolean().optional(),
});

export type KbSearchQuery = z.infer<typeof kbSearchQuerySchema>;

export const KB_SEARCH_FEEDBACK = ["helpful", "not_helpful"] as const;

export const kbSearchFeedbackSchema = z.object({
  feedback: z.enum(KB_SEARCH_FEEDBACK),
});

export type KbSearchFeedback = z.infer<typeof kbSearchFeedbackSchema>;
