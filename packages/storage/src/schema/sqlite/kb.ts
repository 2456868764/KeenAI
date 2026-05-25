import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const KB_SOURCE_TYPES = [
  "help_center",
  "web",
  "file",
  "notion",
  "github",
  "resolved_conversations",
] as const;

export const KB_SOURCE_STATUSES = ["active", "syncing", "error", "disabled"] as const;
export const KB_SOURCE_SYNC_STRATEGIES = ["realtime", "scheduled", "manual"] as const;
export const KB_DOCUMENT_STATUSES = ["active", "archived"] as const;

export type KbSourceType = (typeof KB_SOURCE_TYPES)[number];
export type KbSourceStatus = (typeof KB_SOURCE_STATUSES)[number];
export type KbSourceSyncStrategy = (typeof KB_SOURCE_SYNC_STRATEGIES)[number];
export type KbDocumentStatus = (typeof KB_DOCUMENT_STATUSES)[number];

export const kbSources = sqliteTable(
  "kb_sources",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    type: text("type").$type<KbSourceType>().notNull(),
    name: text("name"),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    secretsRef: text("secrets_ref"),
    status: text("status").$type<KbSourceStatus>().notNull().default("active"),
    syncStrategy: text("sync_strategy").$type<KbSourceSyncStrategy>().default("manual"),
    syncSchedule: text("sync_schedule"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    nextSyncAt: integer("next_sync_at", { mode: "timestamp_ms" }),
    error: text("error"),
    documentCount: integer("document_count").notNull().default(0),
    chunkCount: integer("chunk_count").notNull().default(0),
    createdBy: text("created_by"),
    ...sqliteTimestamps,
  },
  (t) => ({
    brandIdx: index("idx_kb_sources_brand").on(t.orgId, t.brandId, t.status),
  }),
);

export type KbSourceRow = typeof kbSources.$inferSelect;

export const kbDocuments = sqliteTable(
  "kb_documents",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => kbSources.id),
    externalId: text("external_id"),
    title: text("title").notNull(),
    url: text("url"),
    contentHash: text("content_hash"),
    rawContent: text("raw_content"),
    contentType: text("content_type"),
    canonicalLocale: text("canonical_locale"),
    translations: text("translations", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    permissions: text("permissions", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").$type<KbDocumentStatus>().notNull().default("active"),
    version: integer("version").notNull().default(1),
    sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp_ms" }),
    indexedAt: integer("indexed_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (t) => ({
    brandIdx: index("idx_kb_docs_brand").on(t.orgId, t.brandId, t.status),
    hashIdx: index("idx_kb_docs_hash").on(t.contentHash),
    sourceExternalUq: uniqueIndex("uq_kb_docs_source_external").on(t.sourceId, t.externalId),
  }),
);

export type KbDocumentRow = typeof kbDocuments.$inferSelect;
