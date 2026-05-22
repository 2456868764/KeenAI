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
  },
) {
  return ingestConversationMessage(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderType: input.senderType,
    sentAt: input.createdAt,
    plainText: input.plainText,
    isInternal: input.isInternal,
  });
}
