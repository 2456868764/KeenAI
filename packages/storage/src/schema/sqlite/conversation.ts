import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    userId: text("user_id"),
    channelType: text("channel_type").notNull(),
    channelId: text("channel_id").notNull(),
    status: text("status").notNull().default("open"),
    priority: text("priority").default("normal"),
    assigneeId: text("assignee_id"),
    teamId: text("team_id"),
    subject: text("subject"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    attributes: text("attributes", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    firstResponseAt: integer("first_response_at", { mode: "timestamp_ms" }),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    snoozedUntil: integer("snoozed_until", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    unreadCount: integer("unread_count").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    rating: integer("rating"),
    ratingComment: text("rating_comment"),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrgStatus: index("idx_conv_org_status").on(t.orgId, t.status, t.lastMessageAt),
    idxAssignee: index("idx_conv_assignee").on(t.assigneeId, t.status),
    idxBrand: index("idx_conv_brand").on(t.brandId, t.lastMessageAt),
  }),
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderType: text("sender_type").notNull(),
    senderId: text("sender_id"),
    content: text("content", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    plainText: text("plain_text").notNull(),
    contentFormat: text("content_format").notNull().default("text"),
    isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(false),
    inReplyTo: text("in_reply_to"),
    sentVia: text("sent_via"),
    deliveryStatus: text("delivery_status"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxConv: index("idx_msg_conv").on(t.conversationId, t.createdAt),
  }),
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    messageId: text("message_id").references(() => messages.id),
    fileName: text("file_name"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxMessage: index("idx_attachments_message").on(t.messageId),
  }),
);

export const reactions = sqliteTable(
  "reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.actorType, t.actorId, t.emoji] }),
  }),
);

export const conversationEvents = sqliteTable(
  "conversation_events",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type"),
    actorId: text("actor_id"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idx: index("idx_conv_events").on(t.conversationId, t.createdAt),
  }),
);
