import { type ParsedInboundEmail, resolveThreadChannelId } from "@keenai/channels-email";
import { conversations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import {
  buildMessageContent,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
} from "./conversations.js";

export async function ingestInboundEmail(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    parsed: ParsedInboundEmail;
  },
) {
  const existing = await db
    .select({
      id: conversations.id,
      channelId: conversations.channelId,
      subject: conversations.subject,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
        eq(conversations.channelType, "email"),
      ),
    );

  const thread = resolveThreadChannelId(input.parsed, existing);

  let conversation = existing.find((c) => c.channelId === thread.channelId);
  let created = false;

  if (!conversation) {
    const [row] = await db
      .insert(conversations)
      .values({
        orgId: input.orgId,
        brandId: input.brandId,
        userId: input.parsed.from.address,
        channelType: "email",
        channelId: thread.channelId,
        subject: thread.subject,
        status: "open",
        lastMessageAt: new Date(),
        messageCount: 1,
        unreadCount: 1,
      })
      .returning({ id: conversations.id, channelId: conversations.channelId });

    if (!row) throw new Error("conversation_create_failed");
    conversation = { id: row.id, channelId: row.channelId, subject: thread.subject };
    created = true;

    await recordConversationEvent(db, {
      orgId: input.orgId,
      conversationId: row.id,
      eventType: "conversation.created",
      actorType: "user",
      actorId: input.parsed.from.address,
      payload: { channel: "email" },
    });
  }

  const { message } = await insertMessage(db, {
    orgId: input.orgId,
    conversationId: conversation.id,
    senderType: "user",
    senderId: input.parsed.from.address,
    plainText: input.parsed.plainText,
    content: buildMessageContent(input.parsed.plainText),
    isInternal: false,
    sentVia: "email",
    isAgentReply: false,
  });

  const [full] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversation.id))
    .limit(1);

  return {
    created,
    conversation: full ? serializeConversation(full) : null,
    messageId: message.id,
    thread: {
      channelId: thread.channelId,
      matchReason: thread.matchReason,
    },
  };
}
