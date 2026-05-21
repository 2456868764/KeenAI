import { buildDraftPrompt } from "../prompts.js";
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
      const { streamText } = await import("ai");
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({ apiKey: config.apiKey });

      const { system, prompt } = buildDraftPrompt(req);
      const result = streamText({
        model: anthropic(model),
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
