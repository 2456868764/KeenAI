export type StubSealInput = {
  scopeKey: string;
  chunks: Array<{
    id: string;
    bodyMd: string;
    messageId: string | null;
    createdAt: Date;
  }>;
};

export type StubSealOutput = {
  title: string;
  summary: string;
  keyEvents: string[];
  chunkIds: string[];
  messageIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
};

/** Stub seal summary (MT-03): concatenates leaf bodies without LLM. */
export function stubSealSummary(input: StubSealInput): StubSealOutput {
  const bodies = input.chunks.map((chunk) => chunk.bodyMd);
  const messageIds = input.chunks
    .map((chunk) => chunk.messageId)
    .filter((id): id is string => Boolean(id));
  const chunkIds = input.chunks.map((chunk) => chunk.id);

  const keyEvents = bodies
    .map((body) => body.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => line.slice(0, 160));

  const summary = bodies.join("\n\n").slice(0, 4000);
  const title = `Conversation segment (${input.chunks.length} messages)`;

  const timestamps = input.chunks.map((chunk) => chunk.createdAt.getTime()).filter(Number.isFinite);
  const startsAt = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
  const endsAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

  return {
    title,
    summary: summary || title,
    keyEvents,
    chunkIds,
    messageIds,
    startsAt,
    endsAt,
  };
}
