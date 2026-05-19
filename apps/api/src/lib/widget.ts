import type { WidgetAccessClaims } from "@keenai/auth";
import { brands, conversations, messages, organizations } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { publishConversation } from "./conversation-bus.js";
import {
  buildMessageContent,
  type getConversationForOrg,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
  serializeMessage,
} from "./conversations.js";

export function widgetHmacSecret(env: AppVariables["env"]): string {
  return env.WIDGET_HMAC_SECRET ?? env.JWT_SECRET;
}

export async function resolveOrgBySlug(db: AppVariables["store"]["db"], slug: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return org ?? null;
}

export async function resolveBrandBySlug(
  db: AppVariables["store"]["db"],
  orgId: string,
  slug: string,
) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.orgId, orgId), eq(brands.slug, slug)))
    .limit(1);
  return brand ?? null;
}

export function assertWidgetConversation(
  conversation: Awaited<ReturnType<typeof getConversationForOrg>>,
  auth: WidgetAccessClaims,
) {
  if (!conversation) return "not_found" as const;
  if (conversation.orgId !== auth.orgId || conversation.brandId !== auth.brandId) {
    return "forbidden" as const;
  }
  if (conversation.userId && conversation.userId !== auth.sub) {
    return "forbidden" as const;
  }
  return null;
}

export async function findOpenWidgetConversation(
  db: AppVariables["store"]["db"],
  orgId: string,
  brandId: string,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, orgId),
        eq(conversations.brandId, brandId),
        eq(conversations.userId, userId),
        eq(conversations.channelType, "messenger"),
        eq(conversations.status, "open"),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return row ?? null;
}

export async function createWidgetConversation(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    userId: string;
    subject?: string;
    initialMessage?: { plainText: string };
  },
) {
  const channelId = `widget:${input.userId}`;
  const now = new Date();

  const [conversation] = await db
    .insert(conversations)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      userId: input.userId,
      channelType: "messenger",
      channelId,
      subject: input.subject ?? "Messenger",
      status: "open",
      lastMessageAt: input.initialMessage ? now : undefined,
      messageCount: input.initialMessage ? 1 : 0,
      unreadCount: input.initialMessage ? 1 : 0,
    })
    .returning();

  if (!conversation) throw new Error("conversation_create_failed");

  await recordConversationEvent(db, {
    orgId: input.orgId,
    conversationId: conversation.id,
    eventType: "conversation.created",
    actorType: "user",
    actorId: input.userId,
  });

  let firstMessage = null;
  if (input.initialMessage) {
    const result = await insertMessage(db, {
      orgId: input.orgId,
      conversationId: conversation.id,
      senderType: "user",
      senderId: input.userId,
      plainText: input.initialMessage.plainText,
      content: buildMessageContent(input.initialMessage.plainText),
      isInternal: false,
      sentVia: "messenger",
      isAgentReply: false,
    });
    firstMessage = serializeMessage(result.message);
    publishConversation({
      type: "message.created",
      conversationId: conversation.id,
      message: firstMessage,
    });
  }

  return { conversation: serializeConversation(conversation), message: firstMessage };
}

export async function listWidgetMessages(
  db: AppVariables["store"]["db"],
  conversationId: string,
  orgId: string,
  limit: number,
) {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.orgId, orgId),
        eq(messages.isInternal, false),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.reverse().map(serializeMessage);
}
