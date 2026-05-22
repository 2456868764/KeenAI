import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { runEmailImapPoll } from "./email-imap-poll.js";

export const EMAIL_IMAP_POLL_CRON_DEFAULT = "*/5 * * * *";

export function createEmailInngestFunctions(client: Inngest, ctx: AppContext, cron?: string) {
  const pollCron = cron ?? ctx.env.INNGEST_IMAP_POLL_CRON;

  const pollEvent = client.createFunction(
    { id: "keenai-email-imap-poll" },
    { event: "keenai/email.imap_poll" },
    async () => runEmailImapPoll(ctx),
  );

  const pollCronFn = client.createFunction(
    { id: "keenai-email-imap-poll-cron" },
    { cron: pollCron },
    async () => runEmailImapPoll(ctx),
  );

  return [pollEvent, pollCronFn] as const;
}
