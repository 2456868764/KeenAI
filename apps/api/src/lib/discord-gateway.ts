const DISCORD_GATEWAY_VERSION = 10;
const DISCORD_GATEWAY_INTENTS = (1 << 9) | (1 << 12) | (1 << 15);

type DiscordGatewayFrame = {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
};

type DiscordGatewayCursor = {
  sequence?: number;
  sessionId?: string;
  resumeGatewayUrl?: string;
};

type DiscordGatewayFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type DiscordGatewaySocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "error" | "close" | "message",
    listener: (event: unknown) => void,
  ): void;
};

export class DiscordGatewayError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
    readonly clearCursor = false,
  ) {
    super(message);
    this.name = "DiscordGatewayError";
  }
}

export async function runDiscordGateway(input: {
  botToken: string;
  initialCursor?: Record<string, unknown>;
  signal: AbortSignal;
  onMessage(payload: unknown): Promise<void>;
  onHeartbeat(
    cursor: Record<string, unknown>,
    state: "connected" | "reconnecting",
  ): Promise<boolean>;
  fetchFn?: DiscordGatewayFetch;
  createSocket?: (url: string) => DiscordGatewaySocket;
  random?: () => number;
}): Promise<Record<string, unknown>> {
  const fetchFn = input.fetchFn ?? fetch;
  const cursor = parseCursor(input.initialCursor);
  const gateway = cursor.resumeGatewayUrl ?? (await resolveGatewayUrl(fetchFn, input.botToken));
  const socketUrl = `${gateway.replace(/\/$/, "")}/?v=${DISCORD_GATEWAY_VERSION}&encoding=json`;
  const createSocket =
    input.createSocket ?? ((url: string) => new WebSocket(url) as unknown as DiscordGatewaySocket);
  const socket = createSocket(socketUrl);
  const random = input.random ?? Math.random;

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let firstHeartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let awaitingHeartbeatAck = false;
    let connected = false;

    const snapshot = () => compactCursor(cursor);
    const cleanup = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (firstHeartbeatTimer) clearTimeout(firstHeartbeatTimer);
      input.signal.removeEventListener("abort", abort);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(snapshot());
    };
    const abort = () => {
      try {
        socket.close(1000, "runtime stopped");
      } finally {
        finish();
      }
    };
    const send = (payload: unknown) => socket.send(JSON.stringify(payload));
    const heartbeat = async () => {
      if (awaitingHeartbeatAck) {
        socket.close(4000, "heartbeat timeout");
        finish(new DiscordGatewayError("discord_gateway_heartbeat_timeout"));
        return;
      }
      const leaseHeld = await input.onHeartbeat(
        snapshot(),
        connected ? "connected" : "reconnecting",
      );
      if (!leaseHeld) {
        socket.close(4000, "runtime lease lost");
        finish(new DiscordGatewayError("channel_runtime_lease_lost", 0));
        return;
      }
      awaitingHeartbeatAck = true;
      send({ op: 1, d: cursor.sequence ?? null });
    };
    const handleFrame = async (raw: unknown) => {
      const frame = parseFrame(raw);
      if (typeof frame.s === "number") cursor.sequence = frame.s;
      if (frame.op === 10) {
        const interval = heartbeatInterval(frame.d);
        if (cursor.sessionId && typeof cursor.sequence === "number") {
          send({
            op: 6,
            d: {
              token: input.botToken,
              session_id: cursor.sessionId,
              seq: cursor.sequence,
            },
          });
        } else {
          send({
            op: 2,
            d: {
              token: input.botToken,
              intents: DISCORD_GATEWAY_INTENTS,
              properties: { os: process.platform, browser: "keenai", device: "keenai" },
            },
          });
        }
        firstHeartbeatTimer = setTimeout(() => void heartbeat().catch(finish), interval * random());
        heartbeatTimer = setInterval(() => void heartbeat().catch(finish), interval);
        return;
      }
      if (frame.op === 11) {
        awaitingHeartbeatAck = false;
        return;
      }
      if (frame.op === 1) {
        await heartbeat();
        return;
      }
      if (frame.op === 7) {
        socket.close(4000, "server requested reconnect");
        finish(new DiscordGatewayError("discord_gateway_reconnect_requested"));
        return;
      }
      if (frame.op === 9) {
        socket.close(4000, "invalid session");
        finish(new DiscordGatewayError("discord_gateway_invalid_session", 5_000, true));
        return;
      }
      if (frame.op !== 0) return;
      if (frame.t === "READY") {
        const ready = asRecord(frame.d);
        cursor.sessionId = optionalString(ready.session_id);
        cursor.resumeGatewayUrl = optionalString(ready.resume_gateway_url);
        connected = true;
        if (!(await input.onHeartbeat(snapshot(), "connected"))) {
          socket.close(4000, "runtime lease lost");
          finish(new DiscordGatewayError("channel_runtime_lease_lost", 0));
        }
        return;
      }
      if (frame.t === "RESUMED") {
        connected = true;
        await input.onHeartbeat(snapshot(), "connected");
        return;
      }
      if (frame.t === "MESSAGE_CREATE") await input.onMessage(frame);
    };

    input.signal.addEventListener("abort", abort, { once: true });
    socket.addEventListener("message", (event) => {
      const data = (event as { data?: unknown }).data;
      void handleFrame(data).catch((error) => {
        socket.close(4000, "gateway handler failed");
        finish(error);
      });
    });
    socket.addEventListener("error", () =>
      finish(new DiscordGatewayError("discord_gateway_socket_error")),
    );
    socket.addEventListener("close", (event) => {
      if (input.signal.aborted) return finish();
      const code = Number((event as { code?: unknown }).code ?? 0);
      const clearCursor = code === 4007 || code === 4009;
      const retryAfterMs = code === 4004 ? 300_000 : undefined;
      finish(new DiscordGatewayError(`discord_gateway_closed_${code}`, retryAfterMs, clearCursor));
    });
  });
}

async function resolveGatewayUrl(fetchFn: DiscordGatewayFetch, botToken: string): Promise<string> {
  const response = await fetchFn("https://discord.com/api/v10/gateway/bot", {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!response.ok) {
    throw new DiscordGatewayError(
      `discord_gateway_discovery_${response.status}`,
      response.status === 401 ? 300_000 : undefined,
      response.status === 401,
    );
  }
  const payload = asRecord(await response.json());
  const url = optionalString(payload.url);
  if (!url) throw new DiscordGatewayError("discord_gateway_url_missing");
  return url;
}

function parseFrame(raw: unknown): DiscordGatewayFrame {
  const decoded =
    typeof raw === "string"
      ? JSON.parse(raw)
      : raw instanceof ArrayBuffer
        ? JSON.parse(new TextDecoder().decode(raw))
        : raw;
  const value = asRecord(decoded);
  if (typeof value.op !== "number") throw new DiscordGatewayError("discord_gateway_frame_invalid");
  return value as DiscordGatewayFrame;
}

function heartbeatInterval(value: unknown): number {
  const interval = asRecord(value).heartbeat_interval;
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval < 1_000) {
    throw new DiscordGatewayError("discord_gateway_hello_invalid");
  }
  return interval;
}

function parseCursor(value: Record<string, unknown> | undefined): DiscordGatewayCursor {
  if (!value) return {};
  return {
    sequence: typeof value.sequence === "number" ? value.sequence : undefined,
    sessionId: optionalString(value.sessionId),
    resumeGatewayUrl: optionalString(value.resumeGatewayUrl),
  };
}

function compactCursor(cursor: DiscordGatewayCursor): Record<string, unknown> {
  return {
    ...(typeof cursor.sequence === "number" ? { sequence: cursor.sequence } : {}),
    ...(cursor.sessionId ? { sessionId: cursor.sessionId } : {}),
    ...(cursor.resumeGatewayUrl ? { resumeGatewayUrl: cursor.resumeGatewayUrl } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
