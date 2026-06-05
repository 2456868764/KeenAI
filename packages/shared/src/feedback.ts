import { z } from "zod";

export const createFeedbackBoardSchema = z.object({
  brandId: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
});

export const createFeedbackPostSchema = z.object({
  title: z.string().min(1).max(500),
  plainText: z.string().min(1).max(10_000),
  authorId: z.string().min(1).optional(),
  tags: z.array(z.string().min(1).max(64)).max(16).optional(),
});

export const feedbackVoteSchema = z.object({
  userId: z.string().min(1),
  weight: z.number().int().min(1).max(100).optional(),
});

export const createFeedbackCommentSchema = z.object({
  plainText: z.string().min(1).max(5000),
  authorId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
});

export const feedbackDedupQuerySchema = z.object({
  plainText: z.string().min(1).max(10_000),
  threshold: z.coerce.number().min(0.5).max(1).default(0.75),
});

export const listFeedbackPostsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
