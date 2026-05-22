import { streamDraftText } from "../run-draft-stream.js";
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
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      yield* streamDraftText(google(model), req);
    },
  };
}
