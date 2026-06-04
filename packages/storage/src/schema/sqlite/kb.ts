import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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

export const kbChunks = sqliteTable(
  "kb_chunks",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    documentId: text("document_id")
      .notNull()
      .references(() => kbDocuments.id),
    parentChunkId: text("parent_chunk_id"),
    sectionId: text("section_id"),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contextPrefix: text("context_prefix"),
    contentSize: integer("content_size"),
    locale: text("locale"),
    permissions: text("permissions", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    confidence: real("confidence").notNull().default(1),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...sqliteTimestamps,
  },
  (t) => ({
    brandIdx: index("idx_kb_chunks_brand").on(t.orgId, t.brandId),
    docIdx: index("idx_kb_chunks_doc").on(t.documentId),
    localeIdx: index("idx_kb_chunks_locale").on(t.brandId, t.locale),
    docIndexUq: uniqueIndex("uq_kb_chunks_doc_index").on(t.documentId, t.chunkIndex),
  }),
);

export type KbChunkRow = typeof kbChunks.$inferSelect;

export const kbChunkVectors = sqliteTable(
  "kb_chunk_vectors",
  {
    chunkId: text("chunk_id")
      .primaryKey()
      .references(() => kbChunks.id),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    embeddingJson: text("embedding_json").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxOrgBrand: index("idx_kb_chunk_vec_org_brand").on(t.orgId, t.brandId),
  }),
);

export type KbChunkVectorRow = typeof kbChunkVectors.$inferSelect;

/** Relation types used for KB-09 graph expansion (1-hop). */
export const KB_GRAPH_EXPAND_RELATION_TYPES = ["documented_in", "depends_on"] as const;
export type KbGraphExpandRelationType = (typeof KB_GRAPH_EXPAND_RELATION_TYPES)[number];

export const kbEntities = sqliteTable(
  "kb_entities",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    entityType: text("entity_type").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]),
    description: text("description"),
    attributes: text("attributes", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    chunkIds: text("chunk_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqEntity: uniqueIndex("uq_kb_entities").on(t.orgId, t.brandId, t.entityType, t.name),
    idxOrgBrand: index("idx_kb_entities_org_brand").on(t.orgId, t.brandId),
  }),
);

export type KbEntityRow = typeof kbEntities.$inferSelect;

export const kbRelations = sqliteTable(
  "kb_relations",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    fromEntityId: text("from_entity_id")
      .notNull()
      .references(() => kbEntities.id),
    relationType: text("relation_type").$type<KbGraphExpandRelationType>().notNull(),
    toEntityId: text("to_entity_id")
      .notNull()
      .references(() => kbEntities.id),
    confidence: real("confidence").notNull().default(1),
    evidenceChunkIds: text("evidence_chunk_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqRelation: uniqueIndex("uq_kb_relations").on(
      t.orgId,
      t.fromEntityId,
      t.relationType,
      t.toEntityId,
    ),
    idxFrom: index("idx_kb_relations_from").on(t.fromEntityId),
    idxTo: index("idx_kb_relations_to").on(t.toEntityId),
    idxOrgBrand: index("idx_kb_relations_org_brand").on(t.orgId, t.brandId),
  }),
);

export type KbRelationRow = typeof kbRelations.$inferSelect;
