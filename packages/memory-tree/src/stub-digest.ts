export type StubDigestChunk = {
  id: string;
  body: string;
  messageId: string | null;
  conversationId: string | null;
  createdAt: Date;
};

export type StubDigestInput = {
  dateUtc: string;
  brandId: string;
  chunks: StubDigestChunk[];
};

export type StubDigestOutput = {
  title: string;
  summary: string;
  keyEvents: string[];
  chunkIds: string[];
  messageIds: string[];
  conversationIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
};

/** Stub daily digest (MT-04): aggregates high-signal chunks without LLM. */
export function stubDailyDigest(input: StubDigestInput): StubDigestOutput {
  const chunkIds = input.chunks.map((chunk) => chunk.id);
  const messageIds = input.chunks
    .map((chunk) => chunk.messageId)
    .filter((id): id is string => Boolean(id));
  const conversationIds = [
    ...new Set(
      input.chunks.map((chunk) => chunk.conversationId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const keyEvents = input.chunks
    .map((chunk) => chunk.body.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => line.slice(0, 160));

  const summary = input.chunks
    .map((chunk) => chunk.body.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  const title = `Daily support digest — ${input.dateUtc}`;
  const timestamps = input.chunks.map((chunk) => chunk.createdAt.getTime()).filter(Number.isFinite);

  return {
    title,
    summary: summary || `No high-signal activity for brand ${input.brandId} on ${input.dateUtc}.`,
    keyEvents,
    chunkIds,
    messageIds,
    conversationIds,
    startsAt: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
    endsAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null,
  };
}
