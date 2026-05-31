import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import type { Logger } from "pino";
import { scanCustomerUnresponsiveWorkflows } from "./workflow-unresponsive-scan.js";

type Store = ReturnType<typeof createLibsqlStore>;

export function startWorkflowScanScheduler(
  deps: { store: Store; log: Logger; env: ApiEnv },
  intervalMinutes: number,
): () => void {
  if (intervalMinutes <= 0) return () => {};

  const intervalMs = intervalMinutes * 60_000;
  const run = async () => {
    try {
      const result = await scanCustomerUnresponsiveWorkflows(deps.store.db, { env: deps.env });
      deps.log.info(result, "workflow unresponsive scan completed");
    } catch (err) {
      deps.log.error({ err }, "workflow unresponsive scan failed");
    }
  };

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  return () => clearInterval(timer);
}
