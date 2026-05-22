import type { ApiEnv } from "@keenai/shared";
import type { Logger } from "pino";
import { runEmailImapPoll } from "./email-imap-poll.js";

export function startEmailImapPollScheduler(
  deps: { log: Logger; env: ApiEnv },
  intervalMinutes: number,
): () => void {
  if (intervalMinutes <= 0) return () => {};

  const intervalMs = intervalMinutes * 60_000;
  const run = async () => {
    try {
      const result = await runEmailImapPoll(deps.env);
      deps.log.info(result, "email imap poll completed");
    } catch (err) {
      deps.log.error({ err }, "email imap poll failed");
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
