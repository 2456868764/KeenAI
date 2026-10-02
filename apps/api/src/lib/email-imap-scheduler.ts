import type { AppContext } from "../types.js";
import { runEmailImapPoll } from "./email-imap-poll.js";

export function startEmailImapPollScheduler(ctx: AppContext, intervalMinutes: number): () => void {
  if (intervalMinutes <= 0) return () => {};

  const intervalMs = intervalMinutes * 60_000;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runEmailImapPoll(ctx);
      ctx.log.info(result, "email imap poll completed");
    } catch (err) {
      ctx.log.error({ err }, "email imap poll failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  void run();
  return () => clearInterval(timer);
}
