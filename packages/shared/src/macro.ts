import { z } from "zod";

export const createMacroSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(128),
  body: z.string().min(1).max(10_000),
});
