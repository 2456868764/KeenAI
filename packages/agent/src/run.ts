import { type DraftLanguageModel, streamDraftText } from "@keenai/llm";
import type { Agent } from "@mastra/core/agent";
import { mapDraftChunkToAgentEvent, mapMastraChunkToAgentEvent } from "./events.js";
import {
  KEENI_AGENT_MASTRA_ADAPTER,
  buildKeeniMastraAgent,
  buildMastraStreamMessages,
} from "./mastra-agent.js";
import type { KeeniAgentContext } from "./orchestrator.js";
import type { KeeniAgentRunRequest, KeeniAgentStreamEvent } from "./types.js";

export type RunKeeniAgentInput = {
  model: DraftLanguageModel;
  context: KeeniAgentContext;
  request: KeeniAgentRunRequest;
  /** Pre-built Mastra agent; created from context when omitted. */
  agent?: Agent;
  /** Force @keenai/llm streamDraftText instead of Mastra. */
  useMastra?: boolean;
};

/** PAOR run wrapper — streams agent events; post-run hooks land in AE-03+. */
export async function* runKeeniAgentStream(
  input: RunKeeniAgentInput,
): AsyncIterable<KeeniAgentStreamEvent> {
  const useMastra = input.useMastra ?? KEENI_AGENT_MASTRA_ADAPTER.enabled;
  if (useMastra) {
    yield* runMastraAgentStream(input);
    return;
  }

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
    yield* yieldAgentError(error);
  }
}

async function* runMastraAgentStream(
  input: RunKeeniAgentInput,
): AsyncIterable<KeeniAgentStreamEvent> {
  const draftRequest = {
    ...input.context.draftRequest,
    tools: input.context.draftRequest.tools?.slice(0, input.request.toolBudget),
  };
  const agent =
    input.agent ?? buildKeeniMastraAgent({ context: input.context, model: input.model });

  try {
    const stream = await agent.stream(buildMastraStreamMessages(draftRequest), {
      maxSteps: Math.min(input.request.maxIterations, input.context.maxIterations),
      memory: {
        thread: input.request.threadId,
        resource: input.request.resourceId,
      },
    });

    for await (const chunk of stream.fullStream) {
      const event = mapMastraChunkToAgentEvent(chunk);
      if (event) yield event;
    }
    yield { type: "done" };
  } catch (error) {
    yield* yieldAgentError(error);
  }
}

function* yieldAgentError(error: unknown): Generator<KeeniAgentStreamEvent> {
  const message = error instanceof Error ? error.message : String(error);
  yield {
    type: "error",
    error: { name: error instanceof Error ? error.name : "AgentError", message },
  };
}
