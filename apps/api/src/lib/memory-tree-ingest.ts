import { ingestConversationMessage } from "@keenai/memory-tree";
import type { KeenaiDb } from "@keenai/storage";

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
  });

  if (result.created && result.lifecycle === "admitted") {
    const { getMemoryDispatch } = await import("./memory-dispatch-init.js");
    await getMemoryDispatch().enqueueExtractChunk({
      orgId: input.orgId,
      brandId: input.brandId,
      chunkId: result.id,
    });
  }

  return result;
}
