import type { AppContext } from "../types.js";
import { runDueConversationAutoCloseJobs } from "./conversation-auto-close.js";

export function startAgentAutoCloseScheduler(ctx: AppContext, intervalSeconds: number): () => void {
  if (intervalSeconds <= 0) return () => {};

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runDueConversationAutoCloseJobs(ctx.store.db);
      if (result.scanned > 0) ctx.log.info(result, "agent auto-close scan completed");
    } catch (error) {
      ctx.log.error({ error }, "agent auto-close scan failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalSeconds * 1_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return () => clearInterval(timer);
}
