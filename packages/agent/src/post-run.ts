import type { KeeniAgentContext } from "./orchestrator.js";
import { type KeeniResolution, detectResolution } from "./resolution.js";
import type { KeeniAgentParams, KeeniAgentRunRequest } from "./types.js";

export const KEENI_AGENT_INNGEST_EVENTS = {
  RUN_COMPLETED: "agent/run.completed",
} as const;

export type KeeniAgentRunCompletedPayload = {
  params: KeeniAgentParams;
  request: KeeniAgentRunRequest;
  replyText: string;
  resolution: KeeniResolution;
  hadError: boolean;
  finishReason?: string;
  usage?: Record<string, unknown>;
};

export type KeeniAgentPostRunHook = (payload: KeeniAgentRunCompletedPayload) => Promise<void>;

export type KeeniAgentPostRunDispatcher = {
  mode: "sync" | "inngest";
  dispatch(payload: KeeniAgentRunCompletedPayload): Promise<void>;
};

export type InngestSendFn = (payload: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<void>;

export type BuildAgentRunCompletedInput = {
  context: KeeniAgentContext;
  request: KeeniAgentRunRequest;
  replyText: string;
  hadError: boolean;
  finishReason?: string;
  usage?: Record<string, unknown>;
};

export function buildAgentRunCompletedPayload(
  input: BuildAgentRunCompletedInput,
): KeeniAgentRunCompletedPayload {
  const customerMessage = input.context.draftRequest.messages
    .filter((message) => message.role === "user")
    .at(-1)?.plainText;

  return {
    params: input.context.params,
    request: input.request,
    replyText: input.replyText,
    hadError: input.hadError,
    finishReason: input.finishReason,
    usage: input.usage,
    resolution: detectResolution({
      replyText: input.replyText,
      customerMessage,
      trigger: input.request.trigger,
      hadError: input.hadError,
    }),
  };
}

export function createSyncPostRunDispatcher(
  hooks: KeeniAgentPostRunHook[],
): KeeniAgentPostRunDispatcher {
  return {
    mode: "sync",
    async dispatch(payload) {
      for (const hook of hooks) {
        await hook(payload);
      }
    },
  };
}

export function createInngestPostRunDispatcher(send: InngestSendFn): KeeniAgentPostRunDispatcher {
  return {
    mode: "inngest",
    async dispatch(payload) {
      await send({
        name: KEENI_AGENT_INNGEST_EVENTS.RUN_COMPLETED,
        data: payload as unknown as Record<string, unknown>,
      });
    },
  };
}

export async function dispatchAgentRunCompleted(
  dispatcher: KeeniAgentPostRunDispatcher,
  input: BuildAgentRunCompletedInput,
): Promise<KeeniAgentRunCompletedPayload> {
  const payload = buildAgentRunCompletedPayload(input);
  await dispatcher.dispatch(payload);
  return payload;
}
