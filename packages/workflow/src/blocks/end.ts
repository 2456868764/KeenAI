import { z } from "zod";

export const endBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("end"),
});

export type EndBlock = z.infer<typeof endBlockSchema>;
