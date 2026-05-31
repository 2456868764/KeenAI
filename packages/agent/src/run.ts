import { type DraftLanguageModel, streamDraftText } from "@keenai/llm";
import { mapDraftChunkToAgentEvent } from "./events.js";
import type { KeeniAgentContext } from "./orchestrator.js";
import type { KeeniAgentRunRequest, KeeniAgentStreamEvent } from "./types.js";

export type RunKeeniAgentInput = {
  model: DraftLanguageModel;
  context: KeeniAgentContext;
  request: KeeniAgentRunRequest;
};

/** PAOR run wrapper — streams agent events; post-run hooks land in AE-03+. */
export async function* runKeeniAgentStream(
  input: RunKeeniAgentInput,
): AsyncIterable<KeeniAgentStreamEvent> {
  const draftRequest = {
    ...input.context.draftRequest,
    tools: input.context.draftRequest.tools?.slice(0, input.request.toolBudget),
  };

  try {
    for await (const chunk of streamDraftText(input.model, draftRequest, {
      maxSteps: Math.min(input.request.maxIterations, input.context.maxIterations),
    })) {
      const event = mapDraftChunkToAgentEvent(chunk);
      if (event) yield event;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    yield {
      type: "error",
      error: { name: error instanceof Error ? error.name : "AgentError", message },
    };
  }
}
