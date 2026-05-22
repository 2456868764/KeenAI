import { streamDraftText } from "../run-draft-stream.js";
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
      const { createOpenAI } = await import("@ai-sdk/openai");
      const client = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      yield* streamDraftText(client(config.model), req);
    },
  };
}
