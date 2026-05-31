import { describe, expect, it, vi } from "vitest";
import { buildKeeniAgentContext } from "../src/orchestrator.js";
import {
  KEENI_AGENT_INNGEST_EVENTS,
  buildAgentRunCompletedPayload,
  createInngestPostRunDispatcher,
  createSyncPostRunDispatcher,
  dispatchAgentRunCompleted,
} from "../src/post-run.js";

describe("post-run hooks", () => {
  const ctx = buildKeeniAgentContext({
    params: {
      orgId: "org-1",
      brandId: "brand-1",
      conversationId: "conv-1",
    },
    draftRequest: {
      messages: [{ role: "user", plainText: "Thanks, all good now" }],
    },
  });

  const request = {
    trigger: "user_msg" as const,
    stream: true,
    maxIterations: 5,
    toolBudget: 8,
    tokenBudget: 6000,
    resourceId: "user-1",
    threadId: "conv-1",
  };

  it("builds a completed payload with resolution", () => {
    const payload = buildAgentRunCompletedPayload({
      context: ctx,
      request,
      replyText: "Happy to help.",
      hadError: false,
    });
    expect(payload.params.conversationId).toBe("conv-1");
    expect(payload.resolution.type).toBe("confirmed");
  });

  it("runs sync hooks", async () => {
    const hook = vi.fn(async () => {});
    const dispatcher = createSyncPostRunDispatcher([hook]);
    await dispatchAgentRunCompleted(dispatcher, {
      context: ctx,
      request,
      replyText: "Issue is resolved.",
      hadError: false,
    });
    expect(hook).toHaveBeenCalledOnce();
  });

  it("queues inngest agent/run.completed", async () => {
    const send = vi.fn(async () => {});
    const dispatcher = createInngestPostRunDispatcher(send);
    await dispatchAgentRunCompleted(dispatcher, {
      context: ctx,
      request,
      replyText: "Transferring to a human agent.",
      hadError: false,
    });
    expect(send).toHaveBeenCalledWith({
      name: KEENI_AGENT_INNGEST_EVENTS.RUN_COMPLETED,
      data: expect.objectContaining({
        replyText: "Transferring to a human agent.",
        resolution: expect.objectContaining({ type: "escalated" }),
      }),
    });
  });
});
