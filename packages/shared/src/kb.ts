import { z } from "zod";

export const kbSearchQuerySchema = z.object({
  brandId: z.string().min(1),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type KbSearchQuery = z.infer<typeof kbSearchQuerySchema>;
