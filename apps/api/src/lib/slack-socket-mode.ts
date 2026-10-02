import { createChannelRuntimeRequestSignal } from "./channel-runtime-request.js";

const DEFAULT_CONTROL_REQUEST_TIMEOUT_MS = 10_000;

type SlackSocketFrame = {
  type?: string;
  reason?: string;
  envelope_id?: string;
  payload?: unknown;
};

type SlackSocketModeFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type SlackSocketModeSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "error" | "close" | "message",
    listener: (event: unknown) => void,
  ): void;
};

export class SlackSocketModeError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
    readonly clearCursor = false,
  ) {
    super(message);
    this.name = "SlackSocketModeError";
  }
}

export async function runSlackSocketMode(input: {
  appToken: string;
  signal: AbortSignal;
  onEnvelope(payload: unknown): Promise<void>;
  onHeartbeat(state: "connected" | "reconnecting"): Promise<boolean>;
  fetchFn?: SlackSocketModeFetch;
  createSocket?: (url: string) => SlackSocketModeSocket;
  heartbeatMs?: number;
  requestTimeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const fetchFn = input.fetchFn ?? fetch;
  const socketUrl = await resolveSocketUrl(
    fetchFn,
    input.appToken,
    input.signal,
    input.requestTimeoutMs ?? DEFAULT_CONTROL_REQUEST_TIMEOUT_MS,
  );
  const createSocket =
    input.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SlackSocketModeSocket);
  const socket = createSocket(socketUrl);

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false;
    let connected = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      input.signal.removeEventListener("abort", abort);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({});
    };
    const abort = () => {
      try {
        socket.close(1000, "runtime stopped");
      } finally {
        finish();
      }
    };
    const heartbeat = async () => {
      const leaseHeld = await input.onHeartbeat(connected ? "connected" : "reconnecting");
      if (!leaseHeld) {
        socket.close(4000, "runtime lease lost");
        finish(new SlackSocketModeError("channel_runtime_lease_lost", 0));
      }
    };
    const handleFrame = async (raw: unknown) => {
      const frame = parseFrame(raw);
      if (frame.type === "hello") {
        connected = true;
        if (!(await input.onHeartbeat("connected"))) {
          socket.close(4000, "runtime lease lost");
          finish(new SlackSocketModeError("channel_runtime_lease_lost", 0));
          return;
        }
        heartbeatTimer = setInterval(
          () => void heartbeat().catch(finish),
          Math.max(1_000, input.heartbeatMs ?? 15_000),
        );
        return;
      }
      if (frame.type === "disconnect") {
        if (frame.reason === "warning") return;
        socket.close(4000, frame.reason ?? "socket mode disconnect");
        finish(
          new SlackSocketModeError(
            `slack_socket_disconnect_${frame.reason ?? "unknown"}`,
            frame.reason === "link_disabled" ? 300_000 : 1_000,
          ),
        );
        return;
      }
      if (!frame.envelope_id) return;
      if (frame.type === "events_api" || frame.type === "interactive") {
        await input.onEnvelope(frame.payload);
      }
      socket.send(JSON.stringify({ envelope_id: frame.envelope_id }));
    };

    input.signal.addEventListener("abort", abort, { once: true });
    socket.addEventListener("message", (event) => {
      const data = (event as { data?: unknown }).data;
      void handleFrame(data).catch((error) => {
        socket.close(4000, "socket mode handler failed");
        finish(error);
      });
    });
    socket.addEventListener("error", () => finish(new SlackSocketModeError("slack_socket_error")));
    socket.addEventListener("close", (event) => {
      if (input.signal.aborted) return finish();
      const code = Number((event as { code?: unknown }).code ?? 0);
      finish(new SlackSocketModeError(`slack_socket_closed_${code}`));
    });
  });
}

async function resolveSocketUrl(
  fetchFn: SlackSocketModeFetch,
  appToken: string,
  runtimeSignal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  const request = createChannelRuntimeRequestSignal(runtimeSignal, timeoutMs);
  let response: Response;
  try {
    response = await fetchFn("https://slack.com/api/apps.connections.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(),
      signal: request.signal,
    });
  } catch (error) {
    if (request.timedOut()) throw new SlackSocketModeError("slack_socket_discovery_timeout");
    throw error;
  }
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; url?: string };
  if (!response.ok || payload.ok !== true || !payload.url?.startsWith("wss://")) {
    throw new SlackSocketModeError(
      `slack_socket_discovery_${response.status}`,
      response.status === 401 ? 300_000 : undefined,
      response.status === 401,
    );
  }
  return payload.url;
}

function parseFrame(raw: unknown): SlackSocketFrame {
  const decoded =
    typeof raw === "string"
      ? JSON.parse(raw)
      : raw instanceof ArrayBuffer
        ? JSON.parse(new TextDecoder().decode(raw))
        : raw;
  if (!decoded || typeof decoded !== "object") {
    throw new SlackSocketModeError("slack_socket_frame_invalid");
  }
  return decoded as SlackSocketFrame;
}
