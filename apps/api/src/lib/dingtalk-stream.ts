import { DWClient, type DWClientDownStream, TOPIC_ROBOT } from "dingtalk-stream";

const HEARTBEAT_INTERVAL_MS = 20_000;

export class DingTalkStreamError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs = 5_000,
    readonly clearCursor = false,
  ) {
    super(message);
    this.name = "DingTalkStreamError";
  }
}

export type DingTalkStreamOptions = {
  clientId: string;
  clientSecret: string;
  signal: AbortSignal;
  onEnvelope: (payload: Record<string, unknown>) => Promise<void>;
  onHeartbeat?: (state: "connected" | "reconnecting") => Promise<unknown> | unknown;
};

export async function runDingTalkStream(options: DingTalkStreamOptions): Promise<void> {
  const client = new DWClient({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    keepAlive: true,
    debug: false,
  });
  client.registerCallbackListener(TOPIC_ROBOT, (frame) => {
    void processFrame(client, frame, options.onEnvelope);
  });
  await client.connect();
  await options.onHeartbeat?.(client.connected ? "connected" : "reconnecting");
  const heartbeat = setInterval(() => {
    void options.onHeartbeat?.(client.connected ? "connected" : "reconnecting");
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  try {
    await waitForAbort(options.signal);
  } finally {
    clearInterval(heartbeat);
    client.disconnect();
  }
}

async function processFrame(
  client: Pick<DWClient, "socketCallBackResponse">,
  frame: DWClientDownStream,
  onEnvelope: DingTalkStreamOptions["onEnvelope"],
): Promise<void> {
  try {
    const payload = JSON.parse(frame.data) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new DingTalkStreamError("dingtalk_stream_payload_invalid", 60_000);
    }
    await onEnvelope(payload as Record<string, unknown>);
    client.socketCallBackResponse(frame.headers.messageId, { status: "SUCCESS" });
  } catch {
    // No ACK: DingTalk retries the callback and durable ingress deduplicates it.
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
