import { Inngest } from "inngest";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_SCAN_CRON_DEFAULT, createWorkflowInngestFunctions } from "./functions.js";

describe("createWorkflowInngestFunctions", () => {
  it("registers event handlers and cron scan", () => {
    const client = new Inngest({ id: "test" });
    const handlers = {
      dispatchFirstMessage: vi.fn(async () => {}),
      scanCustomerUnresponsive: vi.fn(async () => ({ scanned: 0, triggered: 0, runs: [] })),
    };

    const fns = createWorkflowInngestFunctions(client, handlers);
    expect(fns).toHaveLength(3);
    expect(fns.map((fn) => fn.id())).toEqual([
      "keenai-workflow-first-message",
      "keenai-workflow-scan-unresponsive",
      "keenai-workflow-scan-unresponsive-cron",
    ]);
  });

  it("uses custom scan cron when provided", () => {
    const client = new Inngest({ id: "test" });
    const handlers = {
      dispatchFirstMessage: vi.fn(async () => {}),
      scanCustomerUnresponsive: vi.fn(async () => ({ scanned: 0, triggered: 0, runs: [] })),
    };

    const fns = createWorkflowInngestFunctions(client, handlers, { scanCron: "0 * * * *" });
    expect(fns).toHaveLength(3);
    expect(fns[2]?.id()).toBe("keenai-workflow-scan-unresponsive-cron");
  });

  it("defaults scan cron", () => {
    expect(WORKFLOW_SCAN_CRON_DEFAULT).toBe("*/5 * * * *");
  });
});
