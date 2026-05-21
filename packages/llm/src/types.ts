import { z } from "zod";

export const LLM_PROVIDER_IDS = [
  "stub",
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "kimi",
  "ollama",
] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export const llmProviderIdSchema = z.enum(LLM_PROVIDER_IDS);

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
  readonly id: LlmProviderId;
  streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk>;
}

export type LlmConfig = {
  /** Explicit provider; falls back to first configured remote provider, then stub. */
  provider?: LlmProviderId;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  kimiApiKey?: string;
  kimiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
};
