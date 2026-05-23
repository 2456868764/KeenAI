import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const memoryChunks = sqliteTable(
  "memory_chunks",
  {
    /** Content-addressed sha256 hex (org + brand + sourceRef + body) */
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    source: text("source").notNull(),
    sourceRef: text("source_ref").notNull(),
    bodyMd: text("body_md").notNull(),
    lifecycle: text("lifecycle").notNull().default("pending_extraction"),
    fastScore: real("fast_score"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxOrgBrand: index("idx_mem_chunk_org_brand").on(t.orgId, t.brandId, t.createdAt),
    uqSourceRef: uniqueIndex("uq_mem_chunk_source_ref").on(t.orgId, t.brandId, t.sourceRef),
  }),
);

export type MemoryChunkRow = typeof memoryChunks.$inferSelect;

export const memoryTreeBuffers = sqliteTable(
  "memory_tree_buffers",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    scopeKey: text("scope_key").notNull(),
    level: integer("level").notNull().default(0),
    leafIds: text("leaf_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    tokenCount: integer("token_count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    uqScope: uniqueIndex("uq_mem_tree_buffer_scope").on(t.orgId, t.brandId, t.scopeKey, t.level),
    idxOrgBrand: index("idx_mem_tree_buffer_org_brand").on(t.orgId, t.brandId, t.updatedAt),
  }),
);

export type MemoryTreeBufferRow = typeof memoryTreeBuffers.$inferSelect;

export type MemorySummaryProvenance = {
  chunkIds: string[];
  messageIds: string[];
  keyEvents?: string[];
};

export const memorySummaries = sqliteTable(
  "memory_summaries",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    scopeKey: text("scope_key").notNull(),
    level: integer("level").notNull(),
    parentId: text("parent_id"),
    title: text("title"),
    summary: text("summary").notNull(),
    provenance: text("provenance", { mode: "json" }).$type<MemorySummaryProvenance>().notNull(),
    sealedAt: integer("sealed_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxScope: index("idx_mem_summary_scope").on(t.orgId, t.brandId, t.scopeKey, t.level),
  }),
);

export type MemorySummaryRow = typeof memorySummaries.$inferSelect;

export const memoryEpisodes = sqliteTable(
  "memory_episodes",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    threadId: text("thread_id"),
    summary: text("summary").notNull(),
    topic: text("topic"),
    outcome: text("outcome"),
    sentiment: text("sentiment"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxScope: index("idx_mem_ep_scope").on(t.scope, t.scopeId, t.endsAt),
    idxOrgBrand: index("idx_mem_ep_org_brand").on(t.orgId, t.brandId, t.createdAt),
  }),
);

export type MemoryEpisodeRow = typeof memoryEpisodes.$inferSelect;

export type MemoryHotnessSignals = {
  messageCount7d: number;
  openTicketCount: number;
  negativeCsatWeight: number;
  agentPinBoost: number;
};

export const memoryHotness = sqliteTable(
  "memory_hotness",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    score: real("score").notNull(),
    signals: text("signals", { mode: "json" }).$type<MemoryHotnessSignals>().notNull().default({
      messageCount7d: 0,
      openTicketCount: 0,
      negativeCsatWeight: 0,
      agentPinBoost: 0,
    }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.brandId, t.entityType, t.entityId] }),
    idxOrgBrandScore: index("idx_mem_hotness_org_brand").on(t.orgId, t.brandId, t.score),
  }),
);

export type MemoryHotnessRow = typeof memoryHotness.$inferSelect;

export const memoryChunkVectors = sqliteTable(
  "memory_chunk_vectors",
  {
    chunkId: text("chunk_id")
      .primaryKey()
      .references(() => memoryChunks.id),
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
    idxOrgBrand: index("idx_mem_chunk_vec_org_brand").on(t.orgId, t.brandId),
  }),
);

export type MemoryChunkVectorRow = typeof memoryChunkVectors.$inferSelect;

export const memoryFacts = sqliteTable(
  "memory_facts",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    predicate: text("predicate").notNull(),
    object: text("object", { mode: "json" }).$type<unknown>().notNull(),
    confidence: real("confidence").notNull().default(1),
    importance: real("importance").notNull().default(0.5),
    source: text("source"),
    summaryId: text("summary_id").references(() => memorySummaries.id),
    lastAccessAt: integer("last_access_at", { mode: "timestamp_ms" }),
    accessCount: integer("access_count").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    evictionScore: real("eviction_score"),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqScopePredicate: uniqueIndex("uq_mem_facts").on(t.scope, t.scopeId, t.predicate),
    idxImportance: index("idx_mem_facts_importance").on(t.scope, t.scopeId, t.importance),
    idxOrgBrand: index("idx_mem_facts_org_brand").on(t.orgId, t.brandId),
  }),
);

export type MemoryFactRow = typeof memoryFacts.$inferSelect;

export const memorySlots = sqliteTable(
  "memory_slots",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<unknown>(),
    source: text("source"),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqScopeKey: uniqueIndex("uq_mem_slots").on(t.scope, t.scopeId, t.key),
    idxOrgBrand: index("idx_mem_slots_org_brand").on(t.orgId, t.brandId),
  }),
);

export type MemorySlotRow = typeof memorySlots.$inferSelect;

export const memoryEntities = sqliteTable(
  "memory_entities",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    entityType: text("entity_type").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]),
    attributes: text("attributes", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    mentionCount: integer("mention_count").notNull().default(1),
    summaryId: text("summary_id").references(() => memorySummaries.id),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqEntity: uniqueIndex("uq_mem_entities").on(t.orgId, t.scope, t.scopeId, t.entityType, t.name),
    idxOrgBrand: index("idx_mem_entities_org_brand").on(t.orgId, t.brandId),
  }),
);

export type MemoryEntityRow = typeof memoryEntities.$inferSelect;
