import { z } from "zod";

export const tagConversationBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("tag_conversation"),
  tags: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  mode: z.enum(["append", "replace"]).default("append"),
});

export type TagConversationBlock = z.infer<typeof tagConversationBlockSchema>;

export type TagConversationInput = {
  tags: string[];
  mode: "append" | "replace";
};
