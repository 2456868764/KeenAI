import { ImapFlow } from "imapflow";

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

export type ImapPollClient = {
  pollUnseen(mailbox: string): Promise<{ polled: number }>;
  close(): Promise<void>;
};

export async function createImapPollClient(
  config: ImapPollConfig & { host: string; user: string },
): Promise<ImapPollClient> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port ?? 993,
    secure: (config.port ?? 993) === 993,
    auth: {
      user: config.user,
      pass: config.password ?? "",
    },
    logger: false,
  });

  await client.connect();

  return {
    async pollUnseen(mailbox: string) {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        const polled = Array.isArray(uids) ? uids.length : uids ? 1 : 0;
        return { polled };
      } finally {
        lock.release();
      }
    },
    async close() {
      await client.logout();
    },
  };
}

export type ImapPollDeps = {
  createClient?: (
    config: ImapPollConfig & { host: string; user: string },
  ) => Promise<ImapPollClient>;
};

/**
 * Poll IMAP mailboxes for unseen messages. Ingestion into conversations is not wired yet.
 */
export async function pollImapMailboxes(
  config: ImapPollConfig = {},
  deps?: ImapPollDeps,
): Promise<ImapPollResult> {
  if (!config.host || !config.user) {
    return {
      polled: 0,
      ingested: 0,
      skipped: true,
      reason: "imap_not_configured",
    };
  }

  const createClient = deps?.createClient ?? createImapPollClient;
  const client = await createClient({
    ...config,
    host: config.host,
    user: config.user,
  });

  try {
    const { polled } = await client.pollUnseen(config.mailbox ?? "INBOX");
    return { polled, ingested: 0, skipped: false };
  } finally {
    await client.close();
  }
}
