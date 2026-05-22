import type { KeenaiDb } from "@keenai/storage";
import type { VectorStore } from "@keenai/storage";
import { attachments } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { applyFastScoreToChunk } from "./apply-fast-score.js";
import { canonicalizeConversationMessage, conversationMessageSourceRef } from "./canonicalize.js";
import { type MemoryChunkFtsIndexer, indexMemoryChunkInFts } from "./chunk-fts-index.js";
import { type MemoryChunkEmbedder, embedAdmittedMemoryChunk } from "./chunk-vector-index.js";
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
  channelType?: string;
  channelId?: string;
  ftsIndexer?: MemoryChunkFtsIndexer | null;
  chunkEmbedder?: MemoryChunkEmbedder | null;
  chunkVectorStore?: VectorStore | null;
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

  const hasAttachments = attachmentRows.length > 0;

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

  const result = await persistMemoryChunk(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    source,
    sourceRef,
    bodyMd: doc.bodyMd,
    metadata: {
      conversationId: input.conversationId,
      messageId: input.messageId,
      ...(input.channelType ? { channelType: input.channelType } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
    },
  });

  await indexMemoryChunkInFts(input.ftsIndexer, result, {
    orgId: input.orgId,
    brandId: input.brandId,
    bodyMd: doc.bodyMd,
  });

  if (!result.created) return result;

  const scored = await applyFastScoreToChunk(db, {
    chunkId: result.id,
    plainText: input.plainText,
    source,
    senderType: input.senderType,
    hasAttachments,
  });

  await embedAdmittedMemoryChunk(input.chunkEmbedder, input.chunkVectorStore, {
    chunkId: result.id,
    orgId: input.orgId,
    brandId: input.brandId,
    bodyMd: doc.bodyMd,
    lifecycle: scored.lifecycle,
    created: true,
  });

  return {
    ...result,
    lifecycle: scored.lifecycle,
    fastScore: scored.score,
    chunk: {
      ...result.chunk,
      lifecycle: scored.lifecycle,
      fastScore: scored.score,
    },
  };
}
