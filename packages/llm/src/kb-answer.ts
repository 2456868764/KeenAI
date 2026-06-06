import type { DraftLanguageModel } from "./run-draft-stream.js";
import type { DraftProvider, DraftRequest, DraftStreamChunk } from "./types.js";

export type KbAnswerContextChunk = {
  chunkId: string;
  documentTitle: string;
  content: string;
  contextPrefix?: string | null;
};

export function buildKbAnswerPrompt(input: {
  query: string;
  chunks: KbAnswerContextChunk[];
}): { system: string; prompt: string } {
  const articles = input.chunks
    .map((chunk, index) => {
      const prefix = chunk.contextPrefix ? `[${chunk.contextPrefix}] ` : "";
      return `[${index + 1}] ${chunk.documentTitle}\n${prefix}${chunk.content}`;
    })
    .join("\n\n");

  return {
    system:
      "You are a help center assistant. Answer the user question using ONLY the provided articles. Be concise and helpful. Reference article titles when relevant. If the articles do not contain the answer, say you could not find an answer in the help center.",
    prompt: `Articles:\n${articles}\n\nQuestion: ${input.query}\n\nAnswer:`,
  };
}

export function buildKbDraftRequest(input: {
  query: string;
  chunks: KbAnswerContextChunk[];
}): DraftRequest {
  const kbText = input.chunks
    .map((chunk, index) => {
      const prefix = chunk.contextPrefix ? `[${chunk.contextPrefix}] ` : "";
      return `[${index + 1}] ${chunk.documentTitle}\n${prefix}${chunk.content}`;
    })
    .join("\n\n");

  return {
    messages: [{ role: "user", plainText: input.query }],
    instruction:
      "Answer the help center question using ONLY the knowledge base articles below. Be concise. Reference article titles when helpful. If the articles do not contain the answer, say you could not find an answer in the help center.",
    memoryContext: `Knowledge Base articles:\n${kbText}`,
  };
}

export async function* streamKbAnswerFromProvider(
  provider: DraftProvider,
  input: { query: string; chunks: KbAnswerContextChunk[] },
): AsyncIterable<DraftStreamChunk> {
  yield* provider.streamDraft(buildKbDraftRequest(input));
}

export async function* streamKbAnswerText(
  model: DraftLanguageModel,
  input: { query: string; chunks: KbAnswerContextChunk[] },
): AsyncIterable<DraftStreamChunk> {
  const { streamText } = await import("ai");
  const { system, prompt } = buildKbAnswerPrompt(input);
  const result = streamText({ model, system, prompt });

  for await (const delta of result.textStream) {
    if (delta) yield { type: "text-delta", text: delta };
  }
  yield { type: "done" };
}
