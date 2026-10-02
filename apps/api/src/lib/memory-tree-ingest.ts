import {
  enqueueExtractChunkIfAdmitted,
  ingestConversationMessage,
  invalidateConversationMessageMemory,
} from "@keenai/memory-tree";
import type { KeenaiDb } from "@keenai/storage";
import { getMemoryChunkEmbedder } from "./memory-chunk-embed-init.js";
import { getMemoryChunkFtsIndexer, getMemoryChunkFtsStore } from "./memory-chunk-fts-init.js";
import { getMemoryChunkVectorStore } from "./memory-chunk-vector-init.js";
import { getMemorySummaryFtsStore } from "./memory-summary-fts-init.js";

export async function ingestMemoryTreeForMessage(
  db: KeenaiDb,
  input: {
    orgId: string;
    brandId: string;
    conversationId: string;
    messageId: string;
    senderType: string;
    plainText: string;
    isInternal: boolean;
    createdAt: Date;
    channelType?: string;
    channelId?: string;
  },
  opts?: {
    chunkEmbedder?: ReturnType<typeof getMemoryChunkEmbedder>;
    chunkVectorStore?: ReturnType<typeof getMemoryChunkVectorStore>;
  },
) {
  const result = await ingestConversationMessage(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderType: input.senderType,
    sentAt: input.createdAt,
    plainText: input.plainText,
    isInternal: input.isInternal,
    channelType: input.channelType,
    channelId: input.channelId,
    ftsIndexer: getMemoryChunkFtsIndexer(),
    chunkEmbedder: opts?.chunkEmbedder ?? getMemoryChunkEmbedder(),
    chunkVectorStore: opts?.chunkVectorStore ?? getMemoryChunkVectorStore(),
  });

  if (result.created) {
    const { getMemoryDispatch } = await import("./memory-dispatch-init.js");
    await enqueueExtractChunkIfAdmitted(
      {
        orgId: input.orgId,
        brandId: input.brandId,
        chunkId: result.id,
        lifecycle: result.lifecycle,
        created: result.created,
      },
      (payload) => getMemoryDispatch().enqueueExtractChunk(payload),
    );
  }

  return result;
}

export async function invalidateMemoryTreeForMessage(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; messageId: string },
) {
  return invalidateConversationMessageMemory(db, {
    ...input,
    chunkFts: getMemoryChunkFtsStore(),
    chunkVectorStore: getMemoryChunkVectorStore(),
    summaryFts: getMemorySummaryFtsStore(),
  });
}

export async function refreshMemoryTreeForMessage(
  db: KeenaiDb,
  input: Parameters<typeof ingestMemoryTreeForMessage>[1],
  opts?: Parameters<typeof ingestMemoryTreeForMessage>[2],
) {
  await invalidateMemoryTreeForMessage(db, input);
  return ingestMemoryTreeForMessage(db, input, opts);
}
