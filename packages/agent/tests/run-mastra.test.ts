import { describe, expect, it } from "vitest";
import { buildKeeniAgentContext } from "../src/orchestrator.js";

describe("runKeeniAgentStream (Mastra)", () => {
  it("streams message deltas from a Mastra agent", async () => {
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

    const agent = {
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: "text-delta", payload: { text: "Hello from Mastra" } };
        })(),
      }),
    };

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
      agent: agent as never,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "message_delta", delta: "Hello from Mastra" },
      { type: "done" },
    ]);
  });
});
