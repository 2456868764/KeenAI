import { z } from "zod";

export const kbSearchQuerySchema = z.object({
  brandId: z.string().min(1),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /** Set `false` to skip bge-reranker (KB-08). Defaults to true. */
  rerank: z.coerce.boolean().optional(),
});

export type KbSearchQuery = z.infer<typeof kbSearchQuerySchema>;

/** Public help center AI answer (KB retrieve + streamText). */
export const publicKbAnswerQuerySchema = z.object({
  brandId: z.string().min(1),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  rerank: z.coerce.boolean().optional(),
});

export type PublicKbAnswerQuery = z.infer<typeof publicKbAnswerQuerySchema>;

export const KB_SEARCH_FEEDBACK = ["helpful", "not_helpful"] as const;

export const kbSearchFeedbackSchema = z.object({
  feedback: z.enum(KB_SEARCH_FEEDBACK),
});

export type KbSearchFeedback = z.infer<typeof kbSearchFeedbackSchema>;

export const kbEvalMetricsQuerySchema = z.object({
  brandId: z.string().min(1),
  since: z.string().datetime().optional(),
  /** When true, run golden retrieval eval and merge recall/precision into metrics (KB-23). */
  includeGolden: z.coerce.boolean().optional(),
});

export type KbEvalMetricsQuery = z.infer<typeof kbEvalMetricsQuerySchema>;

export const kbGoldenPromoteSchema = z.object({
  brandId: z.string().min(1),
  queryLogId: z.string().min(1),
  expectedChunkIds: z.array(z.string().min(1)).optional(),
  expectedAnswer: z.string().max(4000).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
});

export type KbGoldenPromote = z.infer<typeof kbGoldenPromoteSchema>;

export const kbEvalRunSchema = z.object({
  brandId: z.string().min(1),
  maxCases: z.coerce.number().int().min(1).max(200).optional(),
  rerank: z.coerce.boolean().optional(),
});

export type KbEvalRun = z.infer<typeof kbEvalRunSchema>;
