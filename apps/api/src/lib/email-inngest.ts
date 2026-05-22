import type { ApiEnv } from "@keenai/shared";
import type { Inngest } from "inngest";
import { runEmailImapPoll } from "./email-imap-poll.js";

export const EMAIL_IMAP_POLL_CRON_DEFAULT = "*/5 * * * *";

export function createEmailInngestFunctions(client: Inngest, env: ApiEnv, cron?: string) {
  const pollCron = cron ?? env.INNGEST_IMAP_POLL_CRON;

  const pollEvent = client.createFunction(
    { id: "keenai-email-imap-poll" },
    { event: "keenai/email.imap_poll" },
    async () => runEmailImapPoll(env),
  );

  const pollCronFn = client.createFunction(
    { id: "keenai-email-imap-poll-cron" },
    { cron: pollCron },
    async () => runEmailImapPoll(env),
  );

  return [pollEvent, pollCronFn] as const;
}
