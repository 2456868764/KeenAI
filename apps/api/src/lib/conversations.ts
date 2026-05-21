import type { AccessTokenClaims } from "@keenai/auth";
import type { messageContentSchema } from "@keenai/shared";
import { brands, conversationEvents, conversations, messages } from "@keenai/storage/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { z } from "zod";
import type { AppVariables } from "../types.js";
import { publishConversation } from "./conversation-bus.js";

type ContentInput = z.infer<typeof messageContentSchema>;

export function buildMessageContent(
  plainText: string,
  content?: ContentInput,
): Record<string, unknown> {
  if (content?.doc) return { type: "tiptap", doc: content.doc };
  if (content?.text) return { type: "text", text: content.text };
  return { type: "text", text: plainText };
}

export function canAccessBrand(auth: AccessTokenClaims, brandId: string): boolean {
  if (auth.brandIds.length === 0) return true;
  return auth.brandIds.includes(brandId);
}

export async function getConversationForOrg(
  db: AppVariables["store"]["db"],
  conversationId: string,
  orgId: string,
) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function recordConversationEvent(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    conversationId: string;
    eventType: string;
    actorType?: string;
    actorId?: string;
    payload?: Record<string, unknown>;
  },
) {
  await db.insert(conversationEvents).values({
    orgId: input.orgId,
    conversationId: input.conversationId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    payload: input.payload,
  });
}

export function serializeConversation(row: typeof conversations.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    userId: row.userId,
    channelType: row.channelType,
    channelId: row.channelId,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId,
    teamId: row.teamId,
    subject: row.subject,
    tags: row.tags,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    unreadCount: row.unreadCount,
    messageCount: row.messageCount,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeMessage(row: typeof messages.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType,
    senderId: row.senderId,
    content: row.content,
    plainText: row.plainText,
    contentFormat: row.contentFormat,
    isInternal: row.isInternal,
    inReplyTo: row.inReplyTo,
    sentVia: row.sentVia,
    deliveryStatus: row.deliveryStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertMessage(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    conversationId: string;
    senderType: string;
    senderId?: string;
    plainText: string;
    content: Record<string, unknown>;
    isInternal: boolean;
    inReplyTo?: string;
    sentVia?: string;
    isAgentReply: boolean;
  },
) {
  const now = new Date();

  const [current] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (!current) throw new Error("conversation not found");

  const [existingUserMessage] =
    input.senderType === "user" && !input.isInternal
      ? await db
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, input.conversationId),
              eq(messages.senderType, "user"),
              eq(messages.isInternal, false),
            ),
          )
          .limit(1)
      : [];

  const triggerFirstMessage =
    input.senderType === "user" && !input.isInternal && !existingUserMessage;

  const [message] = await db
    .insert(messages)
    .values({
      orgId: input.orgId,
      conversationId: input.conversationId,
      senderType: input.senderType,
      senderId: input.senderId,
      plainText: input.plainText,
      content: input.content,
      contentFormat: input.content.type === "tiptap" ? "tiptap" : "text",
      isInternal: input.isInternal,
      inReplyTo: input.inReplyTo,
      sentVia: input.sentVia ?? "web",
      deliveryStatus: "sent",
    })
    .returning();

  if (!message) throw new Error("message insert failed");

  let unreadCount = current.unreadCount;
  let firstResponseAt = current.firstResponseAt;

  if (input.isAgentReply && !input.isInternal) {
    unreadCount = 0;
    firstResponseAt = firstResponseAt ?? now;
  } else if (!input.isInternal) {
    unreadCount += 1;
  }

  const [updated] = await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      messageCount: current.messageCount + 1,
      unreadCount,
      firstResponseAt,
    })
    .where(eq(conversations.id, input.conversationId))
    .returning();

  publishConversation({
    type: "message.created",
    conversationId: input.conversationId,
    message: serializeMessage(message),
  });

  if (updated) {
    publishConversation({
      type: "conversation.updated",
      conversationId: input.conversationId,
      conversation: serializeConversation(updated),
    });
  }

  if (input.senderType === "user" && !input.isInternal && triggerFirstMessage) {
    const { getWorkflowDispatch } = await import("./workflow-dispatch.js");
    await getWorkflowDispatch().dispatchFirstMessage({
      orgId: input.orgId,
      brandId: current.brandId,
      conversationId: input.conversationId,
    });
  }

  return { message, conversation: updated };
}

export async function assertBrandInOrg(
  db: AppVariables["store"]["db"],
  brandId: string,
  orgId: string,
) {
  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)))
    .limit(1);
  return brand ?? null;
}

export function cursorWhere(cursor: string | undefined) {
  if (!cursor) return undefined;
  const [ts, id] = cursor.split("|");
  if (!ts || !id) return undefined;
  const at = new Date(ts);
  return or(
    lt(conversations.lastMessageAt, at),
    and(eq(conversations.lastMessageAt, at), lt(conversations.id, id)),
  );
}

export function encodeCursor(lastMessageAt: Date | null, id: string): string | null {
  if (!lastMessageAt) return null;
  return `${lastMessageAt.toISOString()}|${id}`;
}
