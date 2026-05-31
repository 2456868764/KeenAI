import { type DraftLanguageModel, streamDraftText } from "@keenai/llm";
import type { Agent } from "@mastra/core/agent";
import { mapDraftChunkToAgentEvent, mapMastraChunkToAgentEvent } from "./events.js";
import {
  KEENI_AGENT_MASTRA_ADAPTER,
  buildKeeniMastraAgent,
  buildMastraStreamMessages,
} from "./mastra-agent.js";
import type { KeeniAgentContext } from "./orchestrator.js";
import type { KeeniAgentPostRunDispatcher } from "./post-run.js";
import { dispatchAgentRunCompleted } from "./post-run.js";
import type { KeeniAgentRunRequest, KeeniAgentStreamEvent } from "./types.js";

export type RunKeeniAgentInput = {
  model: DraftLanguageModel;
  context: KeeniAgentContext;
  request: KeeniAgentRunRequest;
  /** Pre-built Mastra agent; created from context when omitted. */
  agent?: Agent;
  /** Force @keenai/llm streamDraftText instead of Mastra. */
  useMastra?: boolean;
  /** Post-run dispatcher for memory consolidation / workflow hooks. */
  postRun?: KeeniAgentPostRunDispatcher;
};

type RunAccumulator = {
  replyText: string;
  hadError: boolean;
};

/** PAOR run wrapper — streams agent events and optional post-run hooks (AE-03). */
export async function* runKeeniAgentStream(
  input: RunKeeniAgentInput,
): AsyncIterable<KeeniAgentStreamEvent> {
  const accumulator: RunAccumulator = { replyText: "", hadError: false };
  const useMastra = input.useMastra ?? KEENI_AGENT_MASTRA_ADAPTER.enabled;

  if (useMastra) {
    yield* runMastraAgentStream(input, accumulator);
  } else {
    yield* runLlmAgentStream(input, accumulator);
  }

  if (input.postRun) {
    await dispatchAgentRunCompleted(input.postRun, {
      context: input.context,
      request: input.request,
      replyText: accumulator.replyText,
      hadError: accumulator.hadError,
    });
  }
}

async function* runLlmAgentStream(
  input: RunKeeniAgentInput,
  accumulator: RunAccumulator,
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
      if (event) {
        trackRunEvent(accumulator, event);
        yield event;
      }
    }
  } catch (error) {
    accumulator.hadError = true;
    yield* yieldAgentError(error);
  }
}

async function* runMastraAgentStream(
  input: RunKeeniAgentInput,
  accumulator: RunAccumulator,
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
      if (event) {
        trackRunEvent(accumulator, event);
        yield event;
      }
    }
    const done: KeeniAgentStreamEvent = { type: "done" };
    trackRunEvent(accumulator, done);
    yield done;
  } catch (error) {
    accumulator.hadError = true;
    yield* yieldAgentError(error);
  }
}

function trackRunEvent(accumulator: RunAccumulator, event: KeeniAgentStreamEvent): void {
  if (event.type === "message_delta") {
    accumulator.replyText += event.delta;
  }
  if (event.type === "error") {
    accumulator.hadError = true;
  }
}

function* yieldAgentError(error: unknown): Generator<KeeniAgentStreamEvent> {
  const message = error instanceof Error ? error.message : String(error);
  yield {
    type: "error",
    error: { name: error instanceof Error ? error.name : "AgentError", message },
  };
}
