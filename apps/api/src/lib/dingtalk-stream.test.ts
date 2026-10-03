import { beforeEach, describe, expect, it, vi } from "vitest";

let callback: ((frame: Record<string, unknown>) => void) | undefined;
const disconnectMock = vi.fn();
const responseMock = vi.fn();

vi.mock("dingtalk-stream", () => ({
  TOPIC_ROBOT: "/v1.0/im/bot/messages/get",
  DWClient: class {
    connected = true;
    registerCallbackListener(_topic: string, listener: (frame: Record<string, unknown>) => void) {
      callback = listener;
      return this;
    }
    async connect() {}
    disconnect = disconnectMock;
    socketCallBackResponse = responseMock;
  },
}));

import { runDingTalkStream } from "./dingtalk-stream.js";

describe("runDingTalkStream", () => {
  beforeEach(() => {
    callback = undefined;
    disconnectMock.mockClear();
    responseMock.mockClear();
  });

  it("ACKs only after durable message handling succeeds", async () => {
    const abort = new AbortController();
    const onEnvelope = vi.fn(async () => undefined);
    const running = runDingTalkStream({
      clientId: "app-key",
      clientSecret: "app-secret",
      signal: abort.signal,
      onEnvelope,
    });
    await vi.waitFor(() => expect(callback).toBeDefined());
    callback?.({
      headers: { messageId: "stream-message-1" },
      data: JSON.stringify({ msgId: "robot-message-1", conversationId: "cid-1" }),
    });
    await vi.waitFor(() => expect(responseMock).toHaveBeenCalled());
    expect(onEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ msgId: "robot-message-1", conversationId: "cid-1" }),
    );
    expect(responseMock).toHaveBeenCalledWith("stream-message-1", { status: "SUCCESS" });
    abort.abort();
    await running;
    expect(disconnectMock).toHaveBeenCalled();
  });

  it("does not ACK when durable handling fails", async () => {
    const abort = new AbortController();
    const running = runDingTalkStream({
      clientId: "app-key",
      clientSecret: "app-secret",
      signal: abort.signal,
      onEnvelope: async () => {
        throw new Error("database unavailable");
      },
    });
    await vi.waitFor(() => expect(callback).toBeDefined());
    callback?.({
      headers: { messageId: "stream-message-2" },
      data: JSON.stringify({ msgId: "robot-message-2", conversationId: "cid-1" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(responseMock).not.toHaveBeenCalled();
    abort.abort();
    await running;
  });

  it("disconnects when its runtime lease is lost", async () => {
    await expect(
      runDingTalkStream({
        clientId: "app-key",
        clientSecret: "app-secret",
        signal: new AbortController().signal,
        onEnvelope: async () => undefined,
        onHeartbeat: async () => false,
      }),
    ).rejects.toThrow("channel_runtime_lease_lost");
    expect(disconnectMock).toHaveBeenCalled();
  });
});
