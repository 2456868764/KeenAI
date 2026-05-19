import type { ConversationRealtimeEvent } from "./types.js";

export type WidgetWebSocketOptions = {
  apiUrl: string;
  conversationId: string;
  widgetToken: string;
  onEvent: (event: ConversationRealtimeEvent) => void;
  onStatus?: (status: "connecting" | "open" | "closed") => void;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

function wsUrl(apiUrl: string, conversationId: string, token: string): string {
  const base = apiUrl.replace(/\/$/, "");
  const http = base.replace(/^http/, "ws");
  const q = new URLSearchParams({ widget_token: token });
  return `${http}/api/v1/widget/conversations/${conversationId}/ws?${q}`;
}

export function connectWidgetWebSocket(opts: WidgetWebSocketOptions): () => void {
  let closed = false;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const maxRetries = opts.maxRetries ?? 8;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 30_000;

  const delay = () => Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);

  const connect = () => {
    if (closed) return;
    opts.onStatus?.("connecting");
    socket = new WebSocket(wsUrl(opts.apiUrl, opts.conversationId, opts.widgetToken));

    socket.addEventListener("open", () => {
      attempt = 0;
      opts.onStatus?.("open");
    });

    socket.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as ConversationRealtimeEvent;
        opts.onEvent(data);
      } catch {
        /* ignore malformed */
      }
    });

    socket.addEventListener("close", () => {
      opts.onStatus?.("closed");
      socket = null;
      if (closed || attempt >= maxRetries) return;
      const wait = delay();
      attempt += 1;
      retryTimer = setTimeout(connect, wait);
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
    opts.onStatus?.("closed");
  };
}
