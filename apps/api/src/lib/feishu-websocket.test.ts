import { beforeEach, describe, expect, it, vi } from "vitest";

let registeredHandlers: Record<string, (data: unknown) => Promise<unknown>> = {};
let clientOptions: Record<string, (...args: never[]) => void> = {};
const closeMock = vi.fn();

vi.mock("@larksuiteoapi/node-sdk", () => ({
  LoggerLevel: { error: 4 },
  EventDispatcher: class {
    register(handlers: Record<string, (data: unknown) => Promise<unknown>>) {
      registeredHandlers = handlers;
      return this;
    }
  },
  WSClient: class {
    constructor(options: Record<string, (...args: never[]) => void>) {
      clientOptions = options;
    }
    async start() {
      clientOptions.onReady?.();
    }
    close = closeMock;
  },
}));

import { runFeishuWebSocket } from "./feishu-websocket.js";

describe("runFeishuWebSocket", () => {
  beforeEach(() => {
    registeredHandlers = {};
    clientOptions = {};
    closeMock.mockClear();
  });

  it("normalizes all supported SDK events and stops on abort", async () => {
    const abort = new AbortController();
    const onEnvelope = vi.fn(async () => undefined);
    const running = runFeishuWebSocket({
      appId: "cli_0123456789abcdef",
      appSecret: "secret",
      signal: abort.signal,
      onEnvelope,
    });
    await vi.waitFor(() => expect(registeredHandlers["im.message.receive_v1"]).toBeDefined());
    const events = [
      "im.message.receive_v1",
      "im.message.message_read_v1",
      "im.message.reaction.created_v1",
      "im.message.reaction.deleted_v1",
      "im.message.recalled_v1",
      "card.action.trigger",
    ];
    for (const [index, eventType] of events.entries()) {
      const payload = {
        event_id: `evt-${index + 1}`,
        sender: { sender_id: { open_id: "ou-1" } },
        message: {
          message_id: "om-1",
          chat_id: "oc-1",
          message_type: "text",
          content: "{}",
        },
      };
      await registeredHandlers[eventType]?.(payload);
      expect(onEnvelope).toHaveBeenLastCalledWith(
        expect.objectContaining({
          header: expect.objectContaining({
            event_id: `evt-${index + 1}`,
            event_type: eventType,
          }),
          event: expect.objectContaining(payload),
        }),
      );
    }
    abort.abort();
    await running;
    expect(closeMock).toHaveBeenCalledWith({ force: true });
  });
});
