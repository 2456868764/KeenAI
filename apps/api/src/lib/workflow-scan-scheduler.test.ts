import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startWorkflowScanScheduler } from "./workflow-scan-scheduler.js";

vi.mock("./workflow-unresponsive-scan.js", () => ({
  scanCustomerUnresponsiveWorkflows: vi.fn(async () => ({
    scanned: 2,
    triggered: 1,
    runs: ["run-1"],
  })),
}));

import { scanCustomerUnresponsiveWorkflows } from "./workflow-unresponsive-scan.js";

describe("startWorkflowScanScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does nothing when interval is zero", () => {
    const stop = startWorkflowScanScheduler(
      { store: {} as never, log: { info: vi.fn(), error: vi.fn() } as never },
      0,
    );
    vi.advanceTimersByTime(60_000);
    expect(scanCustomerUnresponsiveWorkflows).not.toHaveBeenCalled();
    stop();
  });

  it("runs scan on interval", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const stop = startWorkflowScanScheduler({ store: {} as never, log: log as never }, 1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(scanCustomerUnresponsiveWorkflows).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalled();

    stop();
  });
});
