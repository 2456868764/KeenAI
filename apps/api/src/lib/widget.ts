import type { WidgetAccessClaims } from "@keenai/auth";
import type { UpdateWidgetSettingsInput } from "@keenai/shared";
import {
  brands,
  conversations,
  messages,
  organizations,
  widgetFeaturedContent,
  widgetMenuItems,
  widgetQuickActions,
  widgetSettings,
} from "@keenai/storage/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { listPublicChangelogEntries } from "./changelog.js";
import {
  buildMessageContent,
  type getConversationForOrg,
  insertMessage,
  recordConversationEvent,
  serializeConversation,
  serializeMessagesWithAttachments,
} from "./conversations.js";
import { listPublicKbArticles } from "./kb-public.js";

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

function primaryColorFromTheme(theme: unknown): string {
  if (!theme || typeof theme !== "object") return "#7c5cff";
  const colors = (theme as { colors?: Record<string, string> }).colors;
  return colors?.primary ?? colors?.brand ?? "#7c5cff";
}

export async function ensureWidgetSettings(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    brandName: string;
    brandLogoUrl?: string | null;
    brandTheme?: unknown;
  },
) {
  const [existing] = await db
    .select()
    .from(widgetSettings)
    .where(eq(widgetSettings.brandId, input.brandId))
    .limit(1);
  if (existing) return existing;

  const now = new Date();
  const [created] = await db
    .insert(widgetSettings)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      primaryColor: primaryColorFromTheme(input.brandTheme),
      launcherIconUrl: input.brandLogoUrl ?? null,
      agentName: "Keeni AI Agent",
      agentSubtitle: "The team can also help",
      greetingTitle: "Hey! How can we help?",
      greetingBody: "Ask a question, submit a ticket, or browse help articles.",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) throw new Error("widget_settings_create_failed");

  await db.insert(widgetMenuItems).values([
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Home",
      icon: "home",
      itemType: "module",
      moduleKey: "home",
      location: "bottom_nav",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Messages",
      icon: "messages",
      itemType: "module",
      moduleKey: "messages",
      location: "bottom_nav",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Help",
      icon: "help",
      itemType: "module",
      moduleKey: "help",
      location: "bottom_nav",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Changelog",
      icon: "changelog",
      itemType: "module",
      moduleKey: "changelog",
      location: "bottom_nav",
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(widgetQuickActions).values([
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Ask a question",
      actionType: "start_chat",
      payload: { intent: "question" },
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Submit ticket",
      actionType: "submit_ticket",
      payload: { type: "support" },
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      orgId: input.orgId,
      brandId: input.brandId,
      settingsId: created.id,
      label: "Bug report",
      actionType: "submit_ticket",
      payload: { type: "bug" },
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return created;
}

export async function getWidgetConfig(
  db: AppVariables["store"]["db"],
  input: { orgId: string; brandId: string },
) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.orgId, input.orgId)))
    .limit(1);
  if (!brand) return null;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) return null;

  const settings = await ensureWidgetSettings(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    brandName: brand.name,
    brandLogoUrl: brand.logoUrl,
    brandTheme: brand.theme,
  });

  const [menuItems, quickActions] = await Promise.all([
    db
      .select()
      .from(widgetMenuItems)
      .where(and(eq(widgetMenuItems.settingsId, settings.id), eq(widgetMenuItems.enabled, true)))
      .orderBy(asc(widgetMenuItems.sortOrder)),
    db
      .select()
      .from(widgetQuickActions)
      .where(
        and(eq(widgetQuickActions.settingsId, settings.id), eq(widgetQuickActions.enabled, true)),
      )
      .orderBy(asc(widgetQuickActions.sortOrder)),
  ]);

  return {
    org: { id: org.id, slug: org.slug, name: org.name },
    brand: {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      logoUrl: brand.logoUrl,
      primaryColor: settings.primaryColor,
    },
    agent: {
      name: settings.agentName,
      subtitle: settings.agentSubtitle,
      greetingTitle: settings.greetingTitle,
      greetingBody: settings.greetingBody,
      avatarUrl: settings.agentAvatarUrl,
    },
    modules: {
      home: settings.homeEnabled,
      messages: settings.messagesEnabled,
      help: settings.helpEnabled,
      changelog: settings.changelogEnabled,
      tickets: settings.ticketsEnabled,
    },
    menuItems: menuItems.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      icon: item.icon,
      type: item.itemType,
      module: item.moduleKey,
      href: item.href,
      location: item.location,
      sortOrder: item.sortOrder,
    })),
    quickActions: quickActions.map((action) => ({
      id: action.id,
      label: action.label,
      type: action.actionType,
      payload: action.payload,
      sortOrder: action.sortOrder,
    })),
    poweredBy: settings.poweredByEnabled,
  };
}

export async function updateWidgetSettings(
  db: AppVariables["store"]["db"],
  input: { orgId: string; brandId: string; patch: UpdateWidgetSettingsInput },
) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.orgId, input.orgId)))
    .limit(1);
  if (!brand) return null;

  const settings = await ensureWidgetSettings(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    brandName: brand.name,
    brandLogoUrl: brand.logoUrl,
    brandTheme: brand.theme,
  });
  const now = new Date();
  const patch = input.patch;

  await db
    .update(widgetSettings)
    .set({
      primaryColor: patch.primaryColor ?? settings.primaryColor,
      launcherIconUrl:
        patch.launcherIconUrl === undefined ? settings.launcherIconUrl : patch.launcherIconUrl,
      agentName: patch.agentName ?? settings.agentName,
      agentSubtitle: patch.agentSubtitle ?? settings.agentSubtitle,
      agentAvatarUrl:
        patch.agentAvatarUrl === undefined ? settings.agentAvatarUrl : patch.agentAvatarUrl,
      greetingTitle: patch.greetingTitle ?? settings.greetingTitle,
      greetingBody: patch.greetingBody ?? settings.greetingBody,
      homeEnabled: patch.modules?.home ?? settings.homeEnabled,
      messagesEnabled: patch.modules?.messages ?? settings.messagesEnabled,
      helpEnabled: patch.modules?.help ?? settings.helpEnabled,
      changelogEnabled: patch.modules?.changelog ?? settings.changelogEnabled,
      ticketsEnabled: patch.modules?.tickets ?? settings.ticketsEnabled,
      poweredByEnabled: patch.poweredByEnabled ?? settings.poweredByEnabled,
      updatedAt: now,
    })
    .where(eq(widgetSettings.id, settings.id));

  if (patch.menuItems) {
    await db.delete(widgetMenuItems).where(eq(widgetMenuItems.settingsId, settings.id));
    if (patch.menuItems.length > 0) {
      await db.insert(widgetMenuItems).values(
        patch.menuItems.map((item) => ({
          orgId: input.orgId,
          brandId: input.brandId,
          settingsId: settings.id,
          label: item.label,
          description: item.description ?? null,
          icon: item.icon ?? null,
          itemType: item.type,
          moduleKey: item.module ?? null,
          href: item.href ?? null,
          location: item.location,
          enabled: item.enabled,
          sortOrder: item.sortOrder,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  if (patch.quickActions) {
    await db.delete(widgetQuickActions).where(eq(widgetQuickActions.settingsId, settings.id));
    if (patch.quickActions.length > 0) {
      await db.insert(widgetQuickActions).values(
        patch.quickActions.map((action) => ({
          orgId: input.orgId,
          brandId: input.brandId,
          settingsId: settings.id,
          label: action.label,
          actionType: action.type,
          payload: action.payload,
          enabled: action.enabled,
          sortOrder: action.sortOrder,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  if (patch.featured) {
    await db.delete(widgetFeaturedContent).where(eq(widgetFeaturedContent.settingsId, settings.id));
    if (patch.featured.length > 0) {
      await db.insert(widgetFeaturedContent).values(
        patch.featured.map((item) => ({
          orgId: input.orgId,
          brandId: input.brandId,
          settingsId: settings.id,
          contentType: item.type,
          contentId: item.contentId ?? null,
          titleOverride: item.title ?? null,
          imageUrl: item.imageUrl ?? null,
          href: item.href ?? null,
          enabled: item.enabled,
          sortOrder: item.sortOrder,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  return getWidgetConfig(db, { orgId: input.orgId, brandId: input.brandId });
}

export async function getWidgetHome(
  db: AppVariables["store"]["db"],
  input: { orgId: string; brandId: string },
) {
  const config = await getWidgetConfig(db, input);
  if (!config) return null;

  const [featured, articles, changelogEntries] = await Promise.all([
    db
      .select()
      .from(widgetFeaturedContent)
      .where(
        and(
          eq(widgetFeaturedContent.orgId, input.orgId),
          eq(widgetFeaturedContent.brandId, input.brandId),
          eq(widgetFeaturedContent.enabled, true),
        ),
      )
      .orderBy(asc(widgetFeaturedContent.sortOrder))
      .limit(8),
    listPublicKbArticles(db, { orgId: input.orgId, brandId: input.brandId, limit: 5 }),
    listPublicChangelogEntries(db, input.orgId, input.brandId, 3),
  ]);

  return {
    greeting: {
      title: config.agent.greetingTitle,
      body: config.agent.greetingBody,
    },
    quickActions: config.quickActions,
    featured: featured.map((item) => ({
      id: item.id,
      type: item.contentType,
      contentId: item.contentId,
      title: item.titleOverride,
      imageUrl: item.imageUrl,
      href: item.href,
      sortOrder: item.sortOrder,
    })),
    articles,
    changelogEntries,
  };
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

export async function listWidgetConversations(
  db: AppVariables["store"]["db"],
  input: { orgId: string; brandId: string; userId: string; limit?: number },
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
        eq(conversations.userId, input.userId),
        eq(conversations.channelType, "messenger"),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (row) => {
      const [lastMessage] = await db
        .select({
          plainText: messages.plainText,
          senderType: messages.senderType,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, row.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return {
        ...serializeConversation(row),
        lastMessagePreview: lastMessage?.plainText ?? null,
        lastMessageSenderType: lastMessage?.senderType ?? null,
        lastMessageCreatedAt: lastMessage?.createdAt.toISOString() ?? null,
        unreadCount: 0,
      };
    }),
  );
}

export async function createWidgetConversation(
  db: AppVariables["store"]["db"],
  input: {
    orgId: string;
    brandId: string;
    userId: string;
    subject?: string;
    initialMessage?: { plainText: string; attachmentIds?: string[] };
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
      attachmentIds: input.initialMessage.attachmentIds,
      content: buildMessageContent(input.initialMessage.plainText),
      isInternal: false,
      sentVia: "messenger",
      isAgentReply: false,
    });
    firstMessage = result.serialized;
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

  return serializeMessagesWithAttachments(db, rows.reverse());
}
