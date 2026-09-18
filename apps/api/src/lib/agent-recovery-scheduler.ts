import type { AppContext } from "../types.js";
import { recoverStaleAgentRuns } from "./agent-recovery.js";

export function startAgentRecoveryScheduler(ctx: AppContext, intervalMinutes: number): () => void {
  if (intervalMinutes <= 0) return () => {};
  const run = async () => {
    try {
      const result = await recoverStaleAgentRuns(ctx.store.db, {
        staleBefore: new Date(Date.now() - ctx.env.AGENT_TOOL_STALE_SECONDS * 1_000),
      });
      ctx.log.info(result, "agent recovery completed");
    } catch (error) {
      ctx.log.error({ error }, "agent recovery failed");
    }
  };
  const timer = setInterval(() => void run(), intervalMinutes * 60_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return () => clearInterval(timer);
}
