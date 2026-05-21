import type { DraftProvider, DraftRequest, DraftStreamChunk } from "../types.js";

export function createOpenaiDraftProvider(config: {
  apiKey: string;
  model?: string;
}): DraftProvider {
  const model = config.model ?? "gpt-4o-mini";

  return {
    id: "openai",

    async *streamDraft(req: DraftRequest): AsyncIterable<DraftStreamChunk> {
      const { streamText } = await import("ai");
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({ apiKey: config.apiKey });

      const system = [
        "You are a helpful customer support agent drafting a reply.",
        "Be concise, professional, and empathetic.",
        "Output only the reply body — no subject line.",
        req.instruction ? `Agent instruction: ${req.instruction}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const transcript = req.messages
        .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.plainText}`)
        .join("\n");

      const result = streamText({
        model: openai(model),
        system,
        prompt: `Conversation subject: ${req.subject ?? "(none)"}\n\n${transcript}\n\nDraft the next agent reply:`,
      });

      for await (const delta of result.textStream) {
        if (delta) yield { type: "text-delta", text: delta };
      }
      yield { type: "done" };
    },
  };
}
