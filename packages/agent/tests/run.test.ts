import { describe, expect, it, vi } from "vitest";
import { buildKeeniAgentContext } from "../src/orchestrator.js";

vi.mock("@keenai/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keenai/llm")>();
  return {
    ...actual,
    streamDraftText: async function* () {
      yield { type: "text-delta" as const, text: "Hello from Keeni" };
      yield { type: "done" as const };
    },
  };
});

describe("runKeeniAgentStream", () => {
  it("streams message deltas from the llm adapter", async () => {
    const { runKeeniAgentStream } = await import("../src/run.js");
    const ctx = buildKeeniAgentContext({
      params: {
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
      draftRequest: {
        messages: [{ role: "user", plainText: "Need help" }],
      },
    });

    const events = [];
    for await (const event of runKeeniAgentStream({
      model: {} as never,
      context: ctx,
      request: {
        trigger: "user_msg",
        stream: true,
        maxIterations: 5,
        toolBudget: 8,
        tokenBudget: 6000,
        resourceId: "user-1",
        threadId: "conv-1",
      },
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "message_delta", delta: "Hello from Keeni" },
      { type: "done" },
    ]);
  });
});
