import { describe, expect, it, vi } from "vitest";
import { type TelegramPollingFetch, runTelegramPolling } from "./telegram-polling.js";

describe("runTelegramPolling", () => {
  it("advances offset only after durable handling succeeds", async () => {
    const abort = new AbortController();
    const onUpdate = vi.fn(async () => undefined);
    const onHeartbeat = vi.fn(async (cursor: Record<string, unknown>) => {
      abort.abort();
      return true;
    });
    const fetchFn = vi.fn<TelegramPollingFetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: [{ update_id: 41, message: {} }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      runTelegramPolling({
        botToken: "token",
        initialCursor: { offset: 40 },
        signal: abort.signal,
        onUpdate,
        onHeartbeat,
        fetchFn,
        timeoutSeconds: 1,
      }),
    ).resolves.toEqual({ offset: 42 });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ update_id: 41 }));
    expect(onHeartbeat).toHaveBeenCalledWith({ offset: 42 }, "connected");
    const requestUrl = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("offset")).toBe("40");
    expect(JSON.parse(requestUrl.searchParams.get("allowed_updates") ?? "[]")).toEqual(
      expect.arrayContaining([
        "channel_post",
        "business_message",
        "edited_business_message",
        "deleted_business_messages",
        "message_reaction",
      ]),
    );
  });

  it("does not advance or heartbeat when durable handling fails", async () => {
    const onHeartbeat = vi.fn(async () => true);
    await expect(
      runTelegramPolling({
        botToken: "token",
        initialCursor: { offset: 9 },
        signal: new AbortController().signal,
        onUpdate: async () => {
          throw new Error("storage unavailable");
        },
        onHeartbeat,
        fetchFn: vi.fn<TelegramPollingFetch>().mockResolvedValue(
          new Response(JSON.stringify({ ok: true, result: [{ update_id: 9 }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      }),
    ).rejects.toThrow("storage unavailable");
    expect(onHeartbeat).not.toHaveBeenCalled();
  });

  it("times out a hung long-poll request", async () => {
    await expect(
      runTelegramPolling({
        botToken: "token",
        signal: new AbortController().signal,
        requestTimeoutMs: 1,
        onUpdate: async () => undefined,
        onHeartbeat: async () => true,
        fetchFn: async (_url, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          }),
      }),
    ).rejects.toThrow("telegram_poll_timeout");
  });
});
