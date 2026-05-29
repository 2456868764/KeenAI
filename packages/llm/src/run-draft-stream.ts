import { buildDraftToolSet } from "./draft-tools.js";
import { buildDraftStreamInput } from "./prompts.js";
import type { DraftRequest, DraftStreamChunk } from "./types.js";

type LanguageModel = Parameters<Awaited<typeof import("ai")>["streamText"]>[0]["model"];

export async function* streamDraftText(
  model: LanguageModel,
  req: DraftRequest,
): AsyncIterable<DraftStreamChunk> {
  const { streamText } = await import("ai");
  const input = buildDraftStreamInput(req);
  const tools = req.tools?.length ? await buildDraftToolSet(req.tools) : undefined;
  type StreamTextParams = Parameters<typeof streamText>[0];
  const toolOptions = tools ? { tools, maxSteps: 5 } : {};

  const result =
    input.mode === "prompt"
      ? streamText({ model, system: input.system, prompt: input.prompt, ...toolOptions })
      : streamText({
          model,
          system: input.system,
          messages: input.messages as NonNullable<StreamTextParams["messages"]>,
          ...toolOptions,
        });

  for await (const delta of result.textStream) {
    if (delta) yield { type: "text-delta", text: delta };
  }
  yield { type: "done" };
}
