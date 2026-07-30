import { z } from "zod";

export const tagEndUserBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("tag_end_user"),
  tags: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  mode: z.enum(["append", "replace", "remove"]).default("append"),
});

export type TagEndUserBlock = z.infer<typeof tagEndUserBlockSchema>;

export type TagEndUserInput = {
  tags: string[];
  mode: "append" | "replace" | "remove";
};

export type TagEndUserResult = {
  targetCustomerId: string;
  tags: string[];
  taggedConversationCount: number;
};
