import { pollImapMailboxes } from "@keenai/channels-email";
import type { ApiEnv } from "@keenai/shared";

export async function runEmailImapPoll(env: ApiEnv) {
  return pollImapMailboxes({
    host: env.EMAIL_IMAP_HOST,
    port: env.EMAIL_IMAP_PORT,
    user: env.EMAIL_IMAP_USER,
    password: env.EMAIL_IMAP_PASS,
    mailbox: env.EMAIL_IMAP_MAILBOX,
  });
}
