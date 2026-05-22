import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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
