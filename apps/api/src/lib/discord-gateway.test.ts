import { describe, expect, it } from "vitest";
import { type DiscordGatewaySocket, runDiscordGateway } from "./discord-gateway.js";

class FakeSocket implements DiscordGatewaySocket {
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

describe("Discord Gateway runtime", () => {
  it("identifies, persists the READY cursor, and forwards message dispatches", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const messages: unknown[] = [];
    const heartbeats: Array<Record<string, unknown>> = [];
    const runtime = runDiscordGateway({
      botToken: "discord-token",
      signal: abort.signal,
      fetchFn: async () =>
        new Response(JSON.stringify({ url: "wss://gateway.discord.test" }), { status: 200 }),
      createSocket: () => socket,
      random: () => 0.9,
      onMessage: async (payload) => {
        messages.push(payload);
      },
      onHeartbeat: async (cursor) => {
        heartbeats.push(cursor);
        return true;
      },
    });
    await waitFor(() => socket.listeners.has("message"));

    socket.emit("message", {
      data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }),
    });
    await waitFor(() => socket.sent.length === 1);
    expect(socket.sent[0]).toMatchObject({
      op: 2,
      d: { token: "discord-token", intents: 46_592 },
    });

    socket.emit("message", {
      data: JSON.stringify({
        op: 0,
        s: 7,
        t: "READY",
        d: { session_id: "session-1", resume_gateway_url: "wss://resume.discord.test" },
      }),
    });
    await waitFor(() => heartbeats.length === 1);
    expect(heartbeats[0]).toEqual({
      sequence: 7,
      sessionId: "session-1",
      resumeGatewayUrl: "wss://resume.discord.test",
    });

    socket.emit("message", {
      data: JSON.stringify({
        op: 0,
        s: 8,
        t: "MESSAGE_CREATE",
        d: { id: "message-1", channel_id: "channel-1", content: "hello" },
      }),
    });
    await waitFor(() => messages.length === 1);
    abort.abort();
    await expect(runtime).resolves.toEqual({
      sequence: 8,
      sessionId: "session-1",
      resumeGatewayUrl: "wss://resume.discord.test",
    });
    expect(socket.closed).toBe(true);
  });

  it("resumes from a durable cursor instead of identifying again", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const runtime = runDiscordGateway({
      botToken: "discord-token",
      initialCursor: {
        sequence: 42,
        sessionId: "session-42",
        resumeGatewayUrl: "wss://resume.discord.test",
      },
      signal: abort.signal,
      fetchFn: async () => {
        throw new Error("gateway discovery should not run for a resumable cursor");
      },
      createSocket: () => socket,
      onMessage: async () => undefined,
      onHeartbeat: async () => true,
    });
    await waitFor(() => socket.listeners.has("message"));
    socket.emit("message", {
      data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }),
    });
    await waitFor(() => socket.sent.length === 1);
    expect(socket.sent[0]).toEqual({
      op: 6,
      d: { token: "discord-token", session_id: "session-42", seq: 42 },
    });
    abort.abort();
    await runtime;
  });

  it("durably handles interactions before acknowledging Discord", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const order: string[] = [];
    const runtime = runDiscordGateway({
      botToken: "discord-token",
      signal: abort.signal,
      fetchFn: async (url) => {
        if (url.includes("/gateway/bot")) {
          return new Response(JSON.stringify({ url: "wss://gateway.discord.test" }), {
            status: 200,
          });
        }
        order.push("ack");
        return new Response(null, { status: 204 });
      },
      createSocket: () => socket,
      onMessage: async () => {
        order.push("durable");
      },
      onHeartbeat: async () => true,
    });
    await waitFor(() => socket.listeners.has("message"));

    socket.emit("message", {
      data: JSON.stringify({
        op: 0,
        s: 1,
        t: "INTERACTION_CREATE",
        d: { id: "interaction-1", token: "interaction-token" },
      }),
    });
    await waitFor(() => order.length === 2);
    expect(order).toEqual(["durable", "ack"]);

    abort.abort();
    await runtime;
  });

  it("times out gateway discovery instead of holding the runtime lease forever", async () => {
    await expect(
      runDiscordGateway({
        botToken: "discord-token",
        signal: new AbortController().signal,
        requestTimeoutMs: 1,
        fetchFn: async (_url, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          }),
        onMessage: async () => undefined,
        onHeartbeat: async () => true,
      }),
    ).rejects.toThrow("discord_gateway_discovery_timeout");
  });
});

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition_not_met");
}
