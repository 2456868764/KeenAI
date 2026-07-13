import { z } from "zod";

export const gotoBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("goto"),
  targetBlockId: z.string().min(1).max(64),
});

export type GotoBlock = z.infer<typeof gotoBlockSchema>;
