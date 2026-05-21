import { buildDraftPrompt } from "../prompts.js";
import type { DraftProvider, DraftRequest, DraftStreamChunk } from "../types.js";

export const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";

export function createGeminiDraftProvider(config: {
  apiKey: string;
  model?: string;
}): DraftProvider {
  const model = config.model ?? GEMINI_DEFAULT_MODEL;

  return {
    id: "gemini",

    async *streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk> {
      const { streamText } = await import("ai");
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });

      const { system, prompt } = buildDraftPrompt(req);
      const result = streamText({
        model: google(model),
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
