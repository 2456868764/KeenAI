import { streamDraftText } from "../run-draft-stream.js";
import type { DraftProvider, DraftRequest, DraftStreamChunk } from "../types.js";

export const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-haiku-latest";

export function createAnthropicDraftProvider(config: {
  apiKey: string;
  model?: string;
}): DraftProvider {
  const model = config.model ?? ANTHROPIC_DEFAULT_MODEL;

  return {
    id: "anthropic",

    async *streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk> {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      yield* streamDraftText(anthropic(model), req);
    },
  };
}
