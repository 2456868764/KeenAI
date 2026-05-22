import type { AppContext } from "../types.js";
import { runEmailImapPoll } from "./email-imap-poll.js";

export function startEmailImapPollScheduler(ctx: AppContext, intervalMinutes: number): () => void {
  if (intervalMinutes <= 0) return () => {};

  const intervalMs = intervalMinutes * 60_000;
  const run = async () => {
    try {
      const result = await runEmailImapPoll(ctx);
      ctx.log.info(result, "email imap poll completed");
    } catch (err) {
      ctx.log.error({ err }, "email imap poll failed");
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
