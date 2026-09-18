import type { AppContext } from "../types.js";
import { recoverChannelQueues } from "./channel-dispatch.js";

export function startChannelRecoveryScheduler(
  ctx: AppContext,
  intervalSeconds: number,
): () => void {
  if (intervalSeconds <= 0) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await recoverChannelQueues(ctx, 50);
      if (
        result.ingress > 0 ||
        result.sessions > 0 ||
        result.deliveryIntents > 0 ||
        result.delivery > 0
      ) {
        ctx.log.info(result, "channel recovery completed");
      }
    } catch (error) {
      ctx.log.error({ err: error }, "channel recovery failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), intervalSeconds * 1_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  void run();
  return () => clearInterval(timer);
}
