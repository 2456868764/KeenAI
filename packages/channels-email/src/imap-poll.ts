import { ImapFlow, type MessageEnvelopeObject } from "imapflow";

export type ImapPollConfig = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  accessToken?: string;
  secure?: boolean;
  mailbox?: string;
  orgId?: string;
  maxSourceBytes?: number;
};

export type ImapPollResult = {
  polled: number;
  ingested: number;
  oversized: number;
  skipped: boolean;
  reason?: string;
};

export type ImapUnseenMessage = {
  uid: number;
  source: Buffer;
  sizeBytes?: number;
  oversized?: boolean;
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
    secure: config.secure ?? (config.port ?? 993) === 993,
    auth: {
      user: config.user,
      ...(config.accessToken
        ? { accessToken: config.accessToken }
        : { pass: config.password ?? "" }),
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
        const maxSourceBytes = config.maxSourceBytes;
        const envelopes = new Map<
          number,
          { envelope?: MessageEnvelopeObject; sizeBytes?: number }
        >();
        const sourceUids: number[] = [];
        for await (const msg of client.fetch(
          uidList,
          { envelope: true, size: true, uid: true },
          { uid: true },
        )) {
          envelopes.set(msg.uid, { envelope: msg.envelope, sizeBytes: msg.size });
          if (maxSourceBytes && msg.size && msg.size > maxSourceBytes) {
            messages.push({
              uid: msg.uid,
              source: createOversizedImapPlaceholder(
                msg.uid,
                msg.size,
                maxSourceBytes,
                msg.envelope,
              ),
              sizeBytes: msg.size,
              oversized: true,
            });
          } else {
            sourceUids.push(msg.uid);
          }
        }

        const sourceQuery = maxSourceBytes ? { start: 0, maxLength: maxSourceBytes + 1 } : true;
        for await (const msg of client.fetch(
          sourceUids,
          { source: sourceQuery, uid: true },
          { uid: true },
        )) {
          if (msg.source && msg.uid) {
            const metadata = envelopes.get(msg.uid);
            const source = Buffer.from(msg.source);
            if (maxSourceBytes && source.byteLength > maxSourceBytes) {
              messages.push({
                uid: msg.uid,
                source: createOversizedImapPlaceholder(
                  msg.uid,
                  metadata?.sizeBytes ?? source.byteLength,
                  maxSourceBytes,
                  metadata?.envelope,
                ),
                sizeBytes: metadata?.sizeBytes ?? source.byteLength,
                oversized: true,
              });
            } else {
              messages.push({
                uid: msg.uid,
                source,
                sizeBytes: metadata?.sizeBytes ?? source.byteLength,
              });
            }
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
      oversized: 0,
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
  let oversized = 0;

  try {
    const messages = await client.fetchUnseen(config.mailbox ?? "INBOX");

    for (const message of messages) {
      if (!handlers?.onMessage) continue;
      try {
        await handlers.onMessage(message);
        ingested += 1;
        if (message.oversized) oversized += 1;
        if (markSeenAfterIngest) seenUids.push(message.uid);
      } catch {
        // Leave unseen so a later poll can retry.
      }
    }

    if (markSeenAfterIngest && seenUids.length > 0) {
      await client.markSeen(seenUids);
    }

    return { polled: messages.length, ingested, oversized, skipped: false };
  } finally {
    await client.close();
  }
}

export function createOversizedImapPlaceholder(
  uid: number,
  sizeBytes: number,
  maxBytes: number,
  envelope?: MessageEnvelopeObject,
): Buffer {
  const from = formatAddress(envelope?.from?.[0]) || "unknown@invalid.local";
  const to = (envelope?.to ?? []).map(formatAddress).filter(Boolean).join(", ");
  const messageId = safeMessageId(envelope?.messageId, uid);
  const lines = [
    `Message-ID: ${messageId}`,
    `From: ${from}`,
    ...(to ? [`To: ${to}`] : []),
    `Subject: ${sanitizeHeader(envelope?.subject) || "(oversized message)"}`,
    ...(envelope?.date ? [`Date: ${envelope.date.toUTCString()}`] : []),
    ...(envelope?.inReplyTo ? [`In-Reply-To: ${sanitizeHeader(envelope.inReplyTo)}`] : []),
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "X-KeenAI-Oversized: true",
    "",
    `[Message content omitted: raw email is ${sizeBytes} bytes and exceeds the ${maxBytes} byte ingestion limit.]`,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8");
}

function formatAddress(address: { name?: string; address?: string } | undefined): string {
  const email = sanitizeHeader(address?.address);
  if (!email) return "";
  const name = sanitizeHeader(address?.name);
  return name ? `"${name.replaceAll('"', "'")}" <${email}>` : email;
}

function safeMessageId(value: string | undefined, uid: number): string {
  const messageId = sanitizeHeader(value);
  if (!messageId) return `<imap-oversized-${uid}@keenai.local>`;
  return messageId.startsWith("<") && messageId.endsWith(">") ? messageId : `<${messageId}>`;
}

function sanitizeHeader(value: string | undefined): string {
  return (value ?? "").replace(/[\r\n]+/g, " ").trim();
}
