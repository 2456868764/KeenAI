export type ImapPollConfig = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  mailbox?: string;
  orgId?: string;
};

export type ImapPollResult = {
  polled: number;
  ingested: number;
  skipped: boolean;
  reason?: string;
};

/**
 * Poll IMAP mailboxes for new inbound email. Stub until imapflow is wired.
 */
export async function pollImapMailboxes(config: ImapPollConfig = {}): Promise<ImapPollResult> {
  if (!config.host || !config.user) {
    return {
      polled: 0,
      ingested: 0,
      skipped: true,
      reason: "imap_not_configured",
    };
  }

  return { polled: 0, ingested: 0, skipped: false };
}
