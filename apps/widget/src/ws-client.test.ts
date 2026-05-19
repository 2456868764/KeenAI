/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWidgetWebSocket } from "./ws-client.js";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: () => void) {
    if (type === "open") this.onopen = fn;
    if (type === "close") this.onclose = fn;
    if (type === "message") this.onmessage = fn as (ev: { data: string }) => void;
    if (type === "error") this.onerror = fn;
  }

  close() {
    this.onclose?.();
  }
}

describe("connectWidgetWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reconnects with exponential backoff after close", () => {
    const onStatus = vi.fn();
    const disconnect = connectWidgetWebSocket({
      apiUrl: "http://localhost:8090",
      conversationId: "conv-1",
      widgetToken: "tok",
      onEvent: () => {},
      onStatus,
      baseDelayMs: 100,
      maxDelayMs: 800,
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toContain("widget_token=tok");

    MockWebSocket.instances[0]?.close();
    vi.advanceTimersByTime(99);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(MockWebSocket.instances).toHaveLength(2);

    disconnect();
  });
});
