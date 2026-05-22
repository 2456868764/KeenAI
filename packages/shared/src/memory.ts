import { z } from "zod";

export const memoryTreeQuerySchema = z
  .object({
    scope: z.enum(["conversation", "customer", "channel"]),
    id: z.string().min(1),
    brandId: z.string().min(1).optional(),
    channelType: z.enum(["slack", "telegram"]).optional(),
    mode: z.enum(["latest", "drill_down"]).default("latest"),
    level: z.coerce.number().int().min(0).max(2).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.scope === "customer" || value.scope === "channel") && !value.brandId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "brandId_required_for_tree_scope",
        path: ["brandId"],
      });
    }
    if (value.scope === "channel" && !value.channelType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "channelType_required_for_channel_scope",
        path: ["channelType"],
      });
    }
  });

export const memoryDigestQuerySchema = z.object({
  brandId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const memoryContextQuerySchema = z.object({
  conversationId: z.string().min(1),
  instruction: z.string().max(2_000).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type MemoryTreeQuery = z.infer<typeof memoryTreeQuerySchema>;
export type MemoryDigestQuery = z.infer<typeof memoryDigestQuerySchema>;
export type MemoryContextQuery = z.infer<typeof memoryContextQuerySchema>;

export const memoryStatsQuerySchema = z.object({
  brandId: z.string().min(1),
});

export const memorySearchQuerySchema = z.object({
  brandId: z.string().min(1),
  q: z.string().min(1).max(500),
  scope: z.enum(["all", "conversation", "customer", "channel"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type MemoryStatsQuery = z.infer<typeof memoryStatsQuerySchema>;
export type MemorySearchQuery = z.infer<typeof memorySearchQuerySchema>;

export const memoryAgentMemoryRecallQuerySchema = z.object({
  brandId: z.string().min(1),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type MemoryAgentMemoryRecallQuery = z.infer<typeof memoryAgentMemoryRecallQuerySchema>;
