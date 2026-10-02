import { createHash } from "node:crypto";
import type { AuthConfig } from "@keenai/auth";
import { renderTicketStatusEmail } from "@keenai/channels-email";
import type { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  channelConnections,
  channelConversationLinks,
  conversations,
  organizations,
  ticketConversations,
} from "@keenai/storage/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";
import { insertMessage } from "./conversations.js";
import type { SerializedTicket } from "./tickets.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export async function notifyTicketStatusChange(
  db: Db,
  authConfig: AuthConfig,
  input: { orgId: string; ticket: SerializedTicket; statusName: string },
) {
  const customerEmail = input.ticket.customerId;
  if (!customerEmail?.includes("@")) return { sent: false as const, reason: "no_customer_email" };

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  const portalBase = authConfig.portalAppUrl ?? authConfig.appUrl;
  const portalUrl = org
    ? `${portalBase}/tickets/${input.ticket.id}?org=${encodeURIComponent(org.slug)}`
    : undefined;

  const rendered = await renderTicketStatusEmail({
    ticketTitle: input.ticket.title,
    statusName: input.statusName,
    portalUrl,
    locale: "en",
  });
  const target = await resolveTicketEmailTarget(db, authConfig, {
    orgId: input.orgId,
    ticketId: input.ticket.id,
    conversationIds: input.ticket.conversationIds,
    customerEmail,
    subject: rendered.subject,
  });
  if (!target) {
    return {
      sent: false as const,
      reason: "email_connection_not_configured",
      preview: rendered,
    };
  }

  const result = await insertMessage(db, {
    orgId: input.orgId,
    conversationId: target.conversationId,
    senderType: "agent",
    plainText: rendered.text,
    isInternal: false,
    sentVia: "ticket-status",
    isAgentReply: true,
    metadata: {
      source: "ticket_status_notification",
      emailHtml: rendered.html,
      ticketId: input.ticket.id,
      ticketStatus: input.statusName,
    },
  });

  return {
    sent: true as const,
    mode: "durable" as const,
    conversationId: target.conversationId,
    messageId: result.message.id,
  };
}

async function resolveTicketEmailTarget(
  db: Db,
  authConfig: AuthConfig,
  input: {
    orgId: string;
    ticketId: string;
    conversationIds: string[];
    customerEmail: string;
    subject: string;
  },
): Promise<{ conversationId: string; connectionId: string } | null> {
  if (input.conversationIds.length > 0) {
    const linked = await db
      .select({
        conversationId: conversations.id,
        connectionId: channelConnections.id,
      })
      .from(conversations)
      .innerJoin(
        channelConversationLinks,
        eq(channelConversationLinks.conversationId, conversations.id),
      )
      .innerJoin(
        channelConnections,
        eq(channelConnections.id, channelConversationLinks.connectionId),
      )
      .where(
        and(
          inArray(conversations.id, input.conversationIds),
          eq(conversations.orgId, input.orgId),
          eq(conversations.channelType, "email"),
          eq(conversations.userId, input.customerEmail),
          eq(channelConnections.channelType, "email"),
          eq(channelConnections.status, "active"),
        ),
      )
      .orderBy(asc(conversations.createdAt));
    for (const candidate of linked) {
      if (await hasUsableEmailCredentials(db, authConfig, candidate.connectionId)) {
        return candidate;
      }
    }
  }

  const brandId = await resolveTicketBrandId(db, input.orgId, input.conversationIds);
  if (!brandId) return null;
  const connection = await resolveEmailConnection(db, authConfig, input.orgId, brandId);
  if (!connection) return null;

  const digest = createHash("sha256").update(input.customerEmail).digest("hex").slice(0, 12);
  const externalThreadId = `<ticket-${input.ticketId}-${digest}@keenai.local>`;
  const [existingLink] = await db
    .select({ conversationId: channelConversationLinks.conversationId })
    .from(channelConversationLinks)
    .where(
      and(
        eq(channelConversationLinks.connectionId, connection.id),
        eq(channelConversationLinks.externalThreadId, externalThreadId),
      ),
    )
    .limit(1);
  if (existingLink) {
    await db
      .update(conversations)
      .set({ subject: input.subject, userId: input.customerEmail, updatedAt: new Date() })
      .where(eq(conversations.id, existingLink.conversationId));
    return { conversationId: existingLink.conversationId, connectionId: connection.id };
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      orgId: input.orgId,
      brandId,
      userId: input.customerEmail,
      channelType: "email",
      channelId: externalThreadId,
      subject: input.subject,
      status: "open",
      attributes: { source: "ticket_status_notification", ticketId: input.ticketId },
    })
    .returning();
  if (!conversation) throw new Error("ticket_notification_conversation_create_failed");

  const [link] = await db
    .insert(channelConversationLinks)
    .values({
      orgId: input.orgId,
      brandId,
      connectionId: connection.id,
      conversationId: conversation.id,
      externalThreadId,
      metadata: { source: "ticket_status_notification", ticketId: input.ticketId },
    })
    .onConflictDoNothing({
      target: [channelConversationLinks.connectionId, channelConversationLinks.externalThreadId],
    })
    .returning({ conversationId: channelConversationLinks.conversationId });

  if (!link) {
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
    const [winner] = await db
      .select({ conversationId: channelConversationLinks.conversationId })
      .from(channelConversationLinks)
      .where(
        and(
          eq(channelConversationLinks.connectionId, connection.id),
          eq(channelConversationLinks.externalThreadId, externalThreadId),
        ),
      )
      .limit(1);
    if (!winner) throw new Error("ticket_notification_conversation_link_failed");
    return { conversationId: winner.conversationId, connectionId: connection.id };
  }

  await db
    .insert(ticketConversations)
    .values({
      ticketId: input.ticketId,
      conversationId: conversation.id,
      relationship: "notification",
    })
    .onConflictDoNothing();
  return { conversationId: conversation.id, connectionId: connection.id };
}

async function resolveTicketBrandId(db: Db, orgId: string, conversationIds: string[]) {
  if (conversationIds.length > 0) {
    const [linked] = await db
      .select({ brandId: conversations.brandId })
      .from(conversations)
      .where(and(eq(conversations.orgId, orgId), inArray(conversations.id, conversationIds)))
      .orderBy(asc(conversations.createdAt))
      .limit(1);
    if (linked) return linked.brandId;
  }
  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.orgId, orgId))
    .orderBy(asc(brands.createdAt))
    .limit(1);
  return brand?.id;
}

async function resolveEmailConnection(
  db: Db,
  authConfig: AuthConfig,
  orgId: string,
  brandId: string,
) {
  const active = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.orgId, orgId),
        eq(channelConnections.brandId, brandId),
        eq(channelConnections.channelType, "email"),
        eq(channelConnections.status, "active"),
      ),
    )
    .orderBy(asc(channelConnections.createdAt));
  for (const connection of active) {
    if (await hasUsableEmailCredentials(db, authConfig, connection.id)) return connection;
  }
  if (!authConfig.smtp) return null;

  const [fallback] = active;
  if (fallback) {
    try {
      const configured = openChannelCredentials(fallback.credentials, authConfig.jwtSecret);
      const [hydrated] = await db
        .update(channelConnections)
        .set({
          credentials: sealChannelCredentials(
            { ...authConfig.smtp, ...configured },
            authConfig.jwtSecret,
          ),
          updatedAt: new Date(),
        })
        .where(eq(channelConnections.id, fallback.id))
        .returning();
      if (hydrated) return hydrated;
    } catch {
      // Do not overwrite credentials that cannot be decrypted with the current secret.
    }
  }

  const externalAccountId = authConfig.smtp.from;
  const [existing] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.orgId, orgId),
        eq(channelConnections.brandId, brandId),
        eq(channelConnections.channelType, "email"),
        eq(channelConnections.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);
  if (existing) return null;

  const [created] = await db
    .insert(channelConnections)
    .values({
      orgId,
      brandId,
      channelType: "email",
      name: `Email (${externalAccountId})`,
      externalAccountId,
      status: "active",
      transport: "webhook",
      credentials: sealChannelCredentials({ ...authConfig.smtp }, authConfig.jwtSecret),
      settings: { source: "environment" },
    })
    .onConflictDoNothing({
      target: [
        channelConnections.orgId,
        channelConnections.brandId,
        channelConnections.channelType,
        channelConnections.externalAccountId,
      ],
    })
    .returning();
  if (created) return created;
  const [winner] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.orgId, orgId),
        eq(channelConnections.brandId, brandId),
        eq(channelConnections.channelType, "email"),
        eq(channelConnections.externalAccountId, externalAccountId),
        eq(channelConnections.status, "active"),
      ),
    )
    .limit(1);
  return winner ?? null;
}

async function hasUsableEmailCredentials(
  db: Db,
  authConfig: AuthConfig,
  connectionId: string,
): Promise<boolean> {
  const [connection] = await db
    .select({ credentials: channelConnections.credentials })
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!connection) return false;
  try {
    const credentials = openChannelCredentials(connection.credentials, authConfig.jwtSecret);
    return (
      typeof credentials.host === "string" &&
      credentials.host.length > 0 &&
      typeof credentials.from === "string" &&
      credentials.from.length > 0
    );
  } catch {
    return false;
  }
}
