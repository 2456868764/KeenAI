import { describe, expect, it } from "vitest";
import { mapMastraChunkToAgentEvent } from "../src/events.js";

describe("mapMastraChunkToAgentEvent", () => {
  it("maps Mastra stream chunks to Keeni agent events", () => {
    expect(mapMastraChunkToAgentEvent({ type: "text-delta", payload: { text: "Hi" } })).toEqual({
      type: "message_delta",
      delta: "Hi",
    });
    expect(
      mapMastraChunkToAgentEvent({
        type: "tool-call",
        payload: { toolName: "search_kb", args: { q: "refund" } },
      }),
    ).toEqual({
      type: "tool_call_start",
      tool: "search_kb",
      params: { q: "refund" },
    });
    expect(
      mapMastraChunkToAgentEvent({
        type: "tool-result",
        payload: { toolName: "search_kb", result: { ok: true } },
      }),
    ).toEqual({
      type: "tool_call_result",
      tool: "search_kb",
      result: { ok: true },
    });
  });
});
