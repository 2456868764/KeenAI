import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";
import { feedbackPosts } from "./feedback";

export type RoadmapColumnDef = { id: string; label: string };

export const DEFAULT_ROADMAP_COLUMNS: RoadmapColumnDef[] = [
  { id: "planned", label: "Planned" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export const roadmaps = sqliteTable(
  "roadmaps",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    public: integer("public", { mode: "boolean" }).notNull().default(true),
    columns: text("columns", { mode: "json" })
      .$type<RoadmapColumnDef[]>()
      .notNull()
      .default(DEFAULT_ROADMAP_COLUMNS),
    settings: text("settings", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqSlug: uniqueIndex("uq_roadmaps_org_slug").on(t.orgId, t.slug),
    idxOrgBrand: index("idx_roadmaps_org_brand").on(t.orgId, t.brandId),
  }),
);

export const roadmapItems = sqliteTable(
  "roadmap_items",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    roadmapId: text("roadmap_id")
      .notNull()
      .references(() => roadmaps.id),
    title: text("title").notNull(),
    description: text("description"),
    columnId: text("column_id").notNull().default("planned"),
    sortOrder: integer("sort_order").notNull().default(0),
    linkedPostId: text("linked_post_id").references(() => feedbackPosts.id),
    eta: integer("eta", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxRoadmap: index("idx_roadmap_items_roadmap").on(t.roadmapId, t.columnId, t.sortOrder),
  }),
);

export type RoadmapRow = typeof roadmaps.$inferSelect;
export type RoadmapItemRow = typeof roadmapItems.$inferSelect;
