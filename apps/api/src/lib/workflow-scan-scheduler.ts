import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import type { Logger } from "pino";
import { scanScheduledWorkflows } from "./workflow-schedule-scan.js";
import { scanCustomerUnresponsiveWorkflows } from "./workflow-unresponsive-scan.js";

type Store = ReturnType<typeof createLibsqlStore>;

export function startWorkflowScanScheduler(
  deps: { store: Store; log: Logger; env: ApiEnv; authConfig: AuthConfig },
  intervalMinutes: number,
): () => void {
  if (intervalMinutes <= 0) return () => {};

  const intervalMs = intervalMinutes * 60_000;
  const run = async () => {
    try {
      const result = await scanCustomerUnresponsiveWorkflows(deps.store.db, {
        env: deps.env,
        authConfig: deps.authConfig,
      });
      const scheduled = await scanScheduledWorkflows(deps.store.db, {
        env: deps.env,
        authConfig: deps.authConfig,
      });
      deps.log.info({ unresponsive: result, scheduled }, "workflow scan completed");
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
