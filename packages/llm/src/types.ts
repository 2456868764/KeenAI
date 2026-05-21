import { z } from "zod";

export const draftMessageSchema = z.object({
  role: z.enum(["user", "agent", "system"]),
  plainText: z.string(),
});

export const draftRequestSchema = z.object({
  instruction: z.string().max(2_000).optional(),
  messages: z.array(draftMessageSchema).min(1).max(50),
  subject: z.string().max(500).optional(),
});

export type DraftRequest = z.infer<typeof draftRequestSchema>;
export type DraftMessage = z.infer<typeof draftMessageSchema>;

export type DraftStreamChunk = { type: "text-delta"; text: string } | { type: "done" };

export interface DraftProvider {
  readonly id: string;
  streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk>;
}

export type LlmConfig = {
  openaiApiKey?: string;
  openaiModel?: string;
  /** Prefer OpenAI when key is set; otherwise stub. */
  preferOpenai?: boolean;
};
