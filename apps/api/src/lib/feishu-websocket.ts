import * as Lark from "@larksuiteoapi/node-sdk";

const HEARTBEAT_INTERVAL_MS = 20_000;
const CONNECT_TIMEOUT_MS = 20_000;

export class FeishuWebSocketError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs = 5_000,
    readonly clearCursor = false,
  ) {
    super(message);
    this.name = "FeishuWebSocketError";
  }
}

export type FeishuWebSocketOptions = {
  appId: string;
  appSecret: string;
  signal: AbortSignal;
  onEnvelope: (payload: Record<string, unknown>) => Promise<void>;
  onHeartbeat?: (state: "connected" | "reconnecting") => Promise<unknown> | unknown;
};

export async function runFeishuWebSocket(options: FeishuWebSocketOptions): Promise<void> {
  let ready = false;
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const forwardEvent = (eventType: string) => async (data: unknown) => {
    await options.onEnvelope(toFeishuWebhookEnvelope(eventType, data));
  };
  const dispatcher = new Lark.EventDispatcher({
    loggerLevel: Lark.LoggerLevel.error,
  }).register({
    "im.message.receive_v1": forwardEvent("im.message.receive_v1"),
    "im.message.message_read_v1": forwardEvent("im.message.message_read_v1"),
    "im.message.reaction.created_v1": forwardEvent("im.message.reaction.created_v1"),
    "im.message.reaction.deleted_v1": forwardEvent("im.message.reaction.deleted_v1"),
    "im.message.recalled_v1": forwardEvent("im.message.recalled_v1"),
    "card.action.trigger": async (data: unknown) => {
      await options.onEnvelope(toFeishuWebhookEnvelope("card.action.trigger", data));
      return {};
    },
  });
  const client = new Lark.WSClient({
    appId: options.appId,
    appSecret: options.appSecret,
    autoReconnect: true,
    loggerLevel: Lark.LoggerLevel.error,
    handshakeTimeoutMs: CONNECT_TIMEOUT_MS,
    onReady: () => {
      ready = true;
      resolveReady?.();
      void options.onHeartbeat?.("connected");
    },
    onError: (error) => {
      if (!ready) rejectReady?.(error);
    },
    onReconnecting: () => {
      ready = false;
      void options.onHeartbeat?.("reconnecting");
    },
    onReconnected: () => {
      ready = true;
      void options.onHeartbeat?.("connected");
    },
  });
  await client.start({ eventDispatcher: dispatcher });
  const timeout = setTimeout(
    () => rejectReady?.(new Error("feishu_websocket_connect_timeout")),
    CONNECT_TIMEOUT_MS,
  );

  try {
    await readyPromise;
    const heartbeat = setInterval(() => {
      void options.onHeartbeat?.(ready ? "connected" : "reconnecting");
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();
    try {
      await waitForAbort(options.signal);
    } finally {
      clearInterval(heartbeat);
    }
  } catch (error) {
    throw new FeishuWebSocketError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
    client.close({ force: true });
  }
}

function toFeishuWebhookEnvelope(eventType: string, data: unknown): Record<string, unknown> {
  const value = asRecord(data);
  return {
    schema: "2.0",
    header: {
      event_id: value.event_id,
      event_type: eventType,
      create_time: value.create_time,
      token: value.token,
    },
    event: value,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
