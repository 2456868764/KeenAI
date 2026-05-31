import { describe, expect, it, vi } from "vitest";
import { buildKeeniAgentContext } from "../src/orchestrator.js";
import { createSyncPostRunDispatcher } from "../src/post-run.js";

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
      useMastra: false,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "message_delta", delta: "Hello from Keeni" },
      { type: "done" },
    ]);
  });

  it("dispatches post-run hooks after the stream completes", async () => {
    const { runKeeniAgentStream } = await import("../src/run.js");
    const hook = vi.fn(async () => {});
    const ctx = buildKeeniAgentContext({
      params: {
        orgId: "org-1",
        brandId: "brand-1",
        conversationId: "conv-1",
      },
      draftRequest: {
        messages: [{ role: "user", plainText: "Thanks!" }],
      },
    });

    for await (const _event of runKeeniAgentStream({
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
      useMastra: false,
      postRun: createSyncPostRunDispatcher([hook]),
    })) {
      // consume stream
    }

    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toMatchObject({
      replyText: "Hello from Keeni",
      resolution: { type: "confirmed" },
    });
  });
});
