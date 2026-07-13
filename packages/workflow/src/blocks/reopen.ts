import { z } from "zod";

export const reopenBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("reopen"),
});

export type ReopenBlock = z.infer<typeof reopenBlockSchema>;
