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

export type ImapUnseenMessage = {
  uid: number;
  source: Buffer;
};

export type ImapPollClient = {
  fetchUnseen(mailbox: string): Promise<ImapUnseenMessage[]>;
  markSeen(uids: number[]): Promise<void>;
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
    async fetchUnseen(mailbox: string) {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids) return [];
        const uidList = Array.isArray(uids) ? uids : [uids];
        if (uidList.length === 0) return [];

        const messages: ImapUnseenMessage[] = [];
        for await (const msg of client.fetch(uidList, { source: true, uid: true }, { uid: true })) {
          if (msg.source && msg.uid) {
            messages.push({ uid: msg.uid, source: Buffer.from(msg.source) });
          }
        }
        return messages;
      } finally {
        lock.release();
      }
    },
    async markSeen(uids: number[]) {
      if (uids.length === 0) return;
      await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
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

export type ImapPollHandlers = {
  onMessage?: (message: ImapUnseenMessage) => Promise<void>;
  /** Mark messages seen after successful onMessage (default true). */
  markSeen?: boolean;
};

/**
 * Poll IMAP mailboxes for unseen messages and optionally ingest each via onMessage.
 */
export async function pollImapMailboxes(
  config: ImapPollConfig = {},
  deps?: ImapPollDeps,
  handlers?: ImapPollHandlers,
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

  const markSeenAfterIngest = handlers?.markSeen !== false;
  const seenUids: number[] = [];
  let ingested = 0;

  try {
    const messages = await client.fetchUnseen(config.mailbox ?? "INBOX");

    for (const message of messages) {
      if (!handlers?.onMessage) continue;
      try {
        await handlers.onMessage(message);
        ingested += 1;
        if (markSeenAfterIngest) seenUids.push(message.uid);
      } catch {
        // Leave unseen so a later poll can retry.
      }
    }

    if (markSeenAfterIngest && seenUids.length > 0) {
      await client.markSeen(seenUids);
    }

    return { polled: messages.length, ingested, skipped: false };
  } finally {
    await client.close();
  }
}
