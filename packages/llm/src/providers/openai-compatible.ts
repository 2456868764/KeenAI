import { buildDraftPrompt } from "../prompts.js";
import type { DraftProvider, DraftRequest, DraftStreamChunk, LlmProviderId } from "../types.js";

export type OpenAiCompatibleProviderConfig = {
  id: LlmProviderId;
  apiKey: string;
  model: string;
  baseURL: string;
};

/** OpenAI-compatible chat API (OpenAI · DeepSeek · Kimi/Moonshot). */
export function createOpenAiCompatibleDraftProvider(
  config: OpenAiCompatibleProviderConfig,
): DraftProvider {
  return {
    id: config.id,

    async *streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk> {
      const { streamText } = await import("ai");
      const { createOpenAI } = await import("@ai-sdk/openai");
      const client = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });

      const { system, prompt } = buildDraftPrompt(req);
      const result = streamText({
        model: client(config.model),
        system,
        prompt,
      });

      for await (const delta of result.textStream) {
        if (delta) yield { type: "text-delta", text: delta };
      }
      yield { type: "done" };
    },
  };
}
