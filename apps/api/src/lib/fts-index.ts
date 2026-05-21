import type { FTSStore } from "@keenai/storage";
import { conversations, messages } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";

export async function indexConversationForSearch(
  fts: FTSStore,
  db: AppVariables["store"]["db"],
  conversationId: string,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) return;

  const recent = await db
    .select({ plainText: messages.plainText, isInternal: messages.isInternal })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.orgId, conversation.orgId)))
    .orderBy(desc(messages.createdAt))
    .limit(32);

  const bodyParts = [
    conversation.subject,
    ...recent
      .reverse()
      .filter((m) => !m.isInternal)
      .map((m) => m.plainText),
  ].filter(Boolean);

  await fts.index({
    id: conversation.id,
    orgId: conversation.orgId,
    brandId: conversation.brandId,
    body: bodyParts.join("\n"),
  });
}
