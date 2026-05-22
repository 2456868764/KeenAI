import type { KeenaiDb } from "@keenai/storage";
import { attachments } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { canonicalizeConversationMessage, conversationMessageSourceRef } from "./canonicalize.js";
import { persistMemoryChunk } from "./persist.js";
import type { MemoryChunkSource, PersistMemoryChunkResult } from "./types.js";

export type IngestConversationMessageInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  messageId: string;
  senderType: string;
  sentAt: Date;
  plainText: string;
  isInternal: boolean;
};

/** Canonicalize a conversation message and persist a content-addressed memory chunk. */
export async function ingestConversationMessage(
  db: KeenaiDb,
  input: IngestConversationMessageInput,
): Promise<PersistMemoryChunkResult> {
  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, input.messageId));

  const source: MemoryChunkSource = input.isInternal ? "internal_note" : "conversation_message";
  const sourceRef = conversationMessageSourceRef(input.messageId);

  const doc = canonicalizeConversationMessage({
    orgId: input.orgId,
    brandId: input.brandId,
    source,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderType: input.senderType,
    sentAt: input.sentAt,
    plainText: input.plainText,
    attachments: attachmentRows.map((a) => ({
      id: a.id,
      mime: a.contentType,
      fileName: a.fileName,
    })),
  });

  return persistMemoryChunk(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    source,
    sourceRef,
    bodyMd: doc.bodyMd,
    metadata: {
      conversationId: input.conversationId,
      messageId: input.messageId,
    },
  });
}
