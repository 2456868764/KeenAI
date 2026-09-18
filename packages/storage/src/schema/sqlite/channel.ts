import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { conversations, messages } from "./conversation";
import { brands, organizations } from "./core";

export const CHANNEL_TYPES = [
  "widget",
  "email",
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "wecom",
  "feishu",
  "dingtalk",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_CONNECTION_STATUSES = ["active", "disabled", "error"] as const;
export type ChannelConnectionStatus = (typeof CHANNEL_CONNECTION_STATUSES)[number];

export const CHANNEL_CONNECTION_TRANSPORTS = ["webhook", "gateway", "polling", "stream"] as const;
export type ChannelConnectionTransport = (typeof CHANNEL_CONNECTION_TRANSPORTS)[number];

export const CHANNEL_CONNECTION_RUNTIME_STATES = [
  "stopped",
  "connecting",
  "connected",
  "reconnecting",
  "error",
] as const;
export type ChannelConnectionRuntimeState = (typeof CHANNEL_CONNECTION_RUNTIME_STATES)[number];

export const CHANNEL_JOB_STATUSES = [
  "pending",
  "processing",
  "completed",
  "retrying",
  "failed",
  "dead_letter",
  "cancelled",
] as const;
export type ChannelJobStatus = (typeof CHANNEL_JOB_STATUSES)[number];

export const CHANNEL_SESSION_COMMAND_TYPES = [
  "message",
  "steer",
  "followup",
  "collect",
  "interrupt",
] as const;
export type ChannelSessionCommandType = (typeof CHANNEL_SESSION_COMMAND_TYPES)[number];

export const CHANNEL_DELIVERY_RECEIPT_STATUSES = [
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;
export type ChannelDeliveryReceiptStatus = (typeof CHANNEL_DELIVERY_RECEIPT_STATUSES)[number];

export const channelConnections = sqliteTable(
  "channel_connections",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    channelType: text("channel_type").$type<ChannelType>().notNull(),
    name: text("name").notNull(),
    externalAccountId: text("external_account_id").notNull().default("default"),
    status: text("status").$type<ChannelConnectionStatus>().notNull().default("active"),
    transport: text("transport").$type<ChannelConnectionTransport>().notNull().default("webhook"),
    credentials: text("credentials", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    settings: text("settings", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastError: text("last_error"),
    lastConnectedAt: integer("last_connected_at", { mode: "timestamp_ms" }),
    runtimeState: text("runtime_state")
      .$type<ChannelConnectionRuntimeState>()
      .notNull()
      .default("stopped"),
    runtimeOwnerId: text("runtime_owner_id"),
    runtimeLeaseToken: text("runtime_lease_token"),
    runtimeLeaseExpiresAt: integer("runtime_lease_expires_at", { mode: "timestamp_ms" }),
    runtimeHeartbeatAt: integer("runtime_heartbeat_at", { mode: "timestamp_ms" }),
    runtimeNextAttemptAt: integer("runtime_next_attempt_at", { mode: "timestamp_ms" }),
    runtimeCursor: text("runtime_cursor", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reconnectAttempts: integer("reconnect_attempts").notNull().default(0),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqExternalAccount: uniqueIndex("uq_channel_connections_external_account").on(
      table.orgId,
      table.brandId,
      table.channelType,
      table.externalAccountId,
    ),
    idxBrandType: index("idx_channel_connections_brand_type").on(
      table.brandId,
      table.channelType,
      table.status,
    ),
    idxRuntimeLease: index("idx_channel_connections_runtime_lease").on(
      table.status,
      table.transport,
      table.runtimeNextAttemptAt,
      table.runtimeLeaseExpiresAt,
    ),
  }),
);

export const channelIngressEvents = sqliteTable(
  "channel_ingress_events",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => channelConnections.id),
    channelType: text("channel_type").$type<ChannelType>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    rawPayload: text("raw_payload", { mode: "json" }).$type<unknown>().notNull(),
    requestHeaders: text("request_headers", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    status: text("status").$type<ChannelJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: integer("available_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimToken: text("claim_token"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqProviderEvent: uniqueIndex("uq_channel_ingress_provider_event").on(
      table.connectionId,
      table.providerEventId,
    ),
    idxDispatch: index("idx_channel_ingress_dispatch").on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
  }),
);

export const channelIdentities = sqliteTable(
  "channel_identities",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => channelConnections.id),
    externalUserId: text("external_user_id").notNull(),
    contactId: text("contact_id"),
    displayName: text("display_name"),
    profile: text("profile", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqExternalUser: uniqueIndex("uq_channel_identities_external_user").on(
      table.connectionId,
      table.externalUserId,
    ),
    idxContact: index("idx_channel_identities_contact").on(table.orgId, table.contactId),
  }),
);

export const channelConversationLinks = sqliteTable(
  "channel_conversation_links",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => channelConnections.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    externalThreadId: text("external_thread_id").notNull(),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqExternalThread: uniqueIndex("uq_channel_conversation_external_thread").on(
      table.connectionId,
      table.externalThreadId,
    ),
    uqConversationConnection: uniqueIndex("uq_channel_conversation_connection").on(
      table.connectionId,
      table.conversationId,
    ),
  }),
);

export const channelMessageLinks = sqliteTable(
  "channel_message_links",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => channelConnections.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    providerMessageId: text("provider_message_id").notNull(),
    direction: text("direction").$type<"inbound" | "outbound">().notNull(),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqProviderMessage: uniqueIndex("uq_channel_message_provider_message").on(
      table.connectionId,
      table.providerMessageId,
    ),
    idxMessage: index("idx_channel_message_link_message").on(table.messageId),
  }),
);

export const channelSessionCommands = sqliteTable(
  "channel_session_commands",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    ingressEventId: text("ingress_event_id").references(() => channelIngressEvents.id),
    commandType: text("command_type").$type<ChannelSessionCommandType>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    sequence: integer("sequence").notNull(),
    priority: integer("priority").notNull().default(0),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<ChannelJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: integer("available_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimToken: text("claim_token"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqIdempotency: uniqueIndex("uq_channel_session_command_idempotency").on(table.idempotencyKey),
    uqConversationSequence: uniqueIndex("uq_channel_session_command_sequence").on(
      table.conversationId,
      table.sequence,
    ),
    idxDispatch: index("idx_channel_session_command_dispatch").on(
      table.conversationId,
      table.status,
      table.priority,
      table.sequence,
    ),
  }),
);

export const channelOutbox = sqliteTable(
  "channel_outbox",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => channelConnections.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id),
    channelType: text("channel_type").$type<ChannelType>().notNull(),
    externalThreadId: text("external_thread_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<ChannelJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    availableAt: integer("available_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimToken: text("claim_token"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqIdempotency: uniqueIndex("uq_channel_outbox_idempotency").on(table.idempotencyKey),
    idxDispatch: index("idx_channel_outbox_dispatch").on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    idxConversation: index("idx_channel_outbox_conversation").on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);

export const channelDeliveryAttempts = sqliteTable(
  "channel_delivery_attempts",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    outboxId: text("outbox_id")
      .notNull()
      .references(() => channelOutbox.id),
    attempt: integer("attempt").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    disposition: text("disposition"),
    providerStatus: integer("provider_status"),
    providerResponse: text("provider_response", { mode: "json" }).$type<unknown>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    uqAttempt: uniqueIndex("uq_channel_delivery_attempt").on(table.outboxId, table.attempt),
    idxOutbox: index("idx_channel_delivery_attempt_outbox").on(table.outboxId),
  }),
);

export const channelDeliveryReceipts = sqliteTable(
  "channel_delivery_receipts",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    connectionId: text("connection_id")
      .notNull()
      .references(() => channelConnections.id),
    outboxId: text("outbox_id").references(() => channelOutbox.id),
    providerMessageId: text("provider_message_id").notNull(),
    status: text("status").$type<ChannelDeliveryReceiptStatus>().notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    uqReceipt: uniqueIndex("uq_channel_delivery_receipt").on(
      table.connectionId,
      table.providerMessageId,
      table.status,
      table.occurredAt,
    ),
    idxOutbox: index("idx_channel_delivery_receipt_outbox").on(table.outboxId),
  }),
);

export const channelDeadLetters = sqliteTable(
  "channel_dead_letters",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    sourceType: text("source_type").$type<"ingress" | "session" | "delivery">().notNull(),
    sourceId: text("source_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    reason: text("reason").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
    replayCount: integer("replay_count").notNull().default(0),
    lastReplayedAt: integer("last_replayed_at", { mode: "timestamp_ms" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqSource: uniqueIndex("uq_channel_dead_letter_source").on(table.sourceType, table.sourceId),
    idxUnresolved: index("idx_channel_dead_letter_unresolved").on(table.orgId, table.resolvedAt),
  }),
);

export type ChannelConnectionRow = typeof channelConnections.$inferSelect;
export type ChannelIngressEventRow = typeof channelIngressEvents.$inferSelect;
export type ChannelIdentityRow = typeof channelIdentities.$inferSelect;
export type ChannelConversationLinkRow = typeof channelConversationLinks.$inferSelect;
export type ChannelMessageLinkRow = typeof channelMessageLinks.$inferSelect;
export type ChannelSessionCommandRow = typeof channelSessionCommands.$inferSelect;
export type ChannelOutboxRow = typeof channelOutbox.$inferSelect;
export type ChannelDeliveryAttemptRow = typeof channelDeliveryAttempts.$inferSelect;
export type ChannelDeliveryReceiptRow = typeof channelDeliveryReceipts.$inferSelect;
export type ChannelDeadLetterRow = typeof channelDeadLetters.$inferSelect;
