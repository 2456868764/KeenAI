import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_INNGEST_EVENTS, createInngestWorkflowDispatch } from "./inngest.js";
import { createSyncWorkflowDispatch } from "./sync.js";

describe("workflow dispatch adapters", () => {
  it("sync adapter runs handlers inline", async () => {
    const dispatchFirstMessage = vi.fn(async () => {});
    const scanCustomerUnresponsive = vi.fn(async () => ({
      scanned: 1,
      triggered: 2,
      runs: ["r1"],
    }));

    const adapter = createSyncWorkflowDispatch({
      dispatchFirstMessage,
      scanCustomerUnresponsive,
    });

    await adapter.dispatchFirstMessage({
      orgId: "o1",
      brandId: "b1",
      conversationId: "c1",
    });
    const result = await adapter.scanCustomerUnresponsive("o1");

    expect(adapter.mode).toBe("sync");
    expect(dispatchFirstMessage).toHaveBeenCalledOnce();
    expect(result.triggered).toBe(2);
  });

  it("inngest adapter queues events", async () => {
    const send = vi.fn(async () => {});
    const handlers = {
      dispatchFirstMessage: vi.fn(async () => {}),
      scanCustomerUnresponsive: vi.fn(async () => ({ triggered: 1 })),
    };

    const adapter = createInngestWorkflowDispatch(send, handlers);
    await adapter.dispatchFirstMessage({
      orgId: "o1",
      brandId: "b1",
      conversationId: "c1",
    });
    const result = await adapter.scanCustomerUnresponsive("o1");

    expect(adapter.mode).toBe("inngest");
    expect(send).toHaveBeenCalledWith({
      name: WORKFLOW_INNGEST_EVENTS.FIRST_MESSAGE,
      data: { orgId: "o1", brandId: "b1", conversationId: "c1" },
    });
    expect(result.queued).toBe(true);
  });
});
