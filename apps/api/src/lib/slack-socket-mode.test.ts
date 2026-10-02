import { describe, expect, it } from "vitest";
import { type SlackSocketModeSocket, runSlackSocketMode } from "./slack-socket-mode.js";

class FakeSocket implements SlackSocketModeSocket {
  readonly sent: unknown[] = [];
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  addEventListener(
    type: "open" | "error" | "close" | "message",
    listener: (event: unknown) => void,
  ) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: "open" | "error" | "close" | "message", event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe("Slack Socket Mode runtime", () => {
  it("opens a socket, durably handles an event, and then acknowledges its envelope", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const envelopes: unknown[] = [];
    const states: string[] = [];
    const runtime = runSlackSocketMode({
      appToken: "xapp-token",
      signal: abort.signal,
      fetchFn: async (_url, init) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer xapp-token");
        return new Response(JSON.stringify({ ok: true, url: "wss://wss.slack.test/link" }), {
          status: 200,
        });
      },
      createSocket: () => socket,
      onEnvelope: async (payload) => {
        envelopes.push(payload);
      },
      onHeartbeat: async (state) => {
        states.push(state);
        return true;
      },
    });
    await waitFor(() => socket.listeners.has("message"));

    socket.emit("message", { data: JSON.stringify({ type: "hello" }) });
    await waitFor(() => states.length === 1);
    socket.emit("message", {
      data: JSON.stringify({
        type: "events_api",
        envelope_id: "envelope-1",
        payload: { event_id: "event-1", event: { type: "message", ts: "1.0" } },
      }),
    });
    await waitFor(() => socket.sent.length === 1);
    expect(envelopes).toHaveLength(1);
    expect(socket.sent).toEqual([{ envelope_id: "envelope-1" }]);

    abort.abort();
    await expect(runtime).resolves.toEqual({});
    expect(socket.closed).toBe(true);
  });

  it("requests a reconnect when Slack rotates the socket URL", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const runtime = runSlackSocketMode({
      appToken: "xapp-token",
      signal: abort.signal,
      fetchFn: async () =>
        new Response(JSON.stringify({ ok: true, url: "wss://wss.slack.test/link" }), {
          status: 200,
        }),
      createSocket: () => socket,
      onEnvelope: async () => undefined,
      onHeartbeat: async () => true,
    });
    await waitFor(() => socket.listeners.has("message"));
    socket.emit("message", {
      data: JSON.stringify({ type: "disconnect", reason: "refresh_requested" }),
    });
    await expect(runtime).rejects.toThrow("slack_socket_disconnect_refresh_requested");
  });

  it("times out socket discovery instead of holding the runtime lease forever", async () => {
    await expect(
      runSlackSocketMode({
        appToken: "xapp-token",
        signal: new AbortController().signal,
        requestTimeoutMs: 1,
        fetchFn: async (_url, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          }),
        onEnvelope: async () => undefined,
        onHeartbeat: async () => true,
      }),
    ).rejects.toThrow("slack_socket_discovery_timeout");
  });
});

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition_not_met");
}
