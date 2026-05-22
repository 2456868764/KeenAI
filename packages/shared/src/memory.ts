import { z } from "zod";

export const memoryTreeQuerySchema = z.object({
  scope: z.enum(["conversation"]),
  id: z.string().min(1),
  mode: z.enum(["latest", "drill_down"]).default("latest"),
  level: z.coerce.number().int().min(0).max(2).optional(),
});

export const memoryDigestQuerySchema = z.object({
  brandId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type MemoryTreeQuery = z.infer<typeof memoryTreeQuerySchema>;
export type MemoryDigestQuery = z.infer<typeof memoryDigestQuerySchema>;
