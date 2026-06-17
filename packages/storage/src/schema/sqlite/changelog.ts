import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const CHANGELOG_ENTRY_STATUSES = ["draft", "scheduled", "published"] as const;
export type ChangelogEntryStatus = (typeof CHANGELOG_ENTRY_STATUSES)[number];

export const CHANGELOG_CATEGORY_TAGS = ["new", "improved", "fixed"] as const;
export type ChangelogCategoryTag = (typeof CHANGELOG_CATEGORY_TAGS)[number];

export type ChangelogAudienceSegment = {
  name: string;
  plan?: "free" | "pro" | "enterprise";
  countries?: string[];
};

export type ChangelogAudienceFilter = {
  segments: ChangelogAudienceSegment[];
};

export const changelogEntries = sqliteTable(
  "changelog_entries",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    plainText: text("plain_text").notNull().default(""),
    categoryTags: text("category_tags", { mode: "json" })
      .$type<ChangelogCategoryTag[]>()
      .notNull()
      .default([]),
    status: text("status").$type<ChangelogEntryStatus>().notNull().default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
    audienceFilter: text("audience_filter", { mode: "json" })
      .$type<ChangelogAudienceFilter>()
      .notNull()
      .default({ segments: [] }),
    authorMemberId: text("author_member_id"),
    viewCount: integer("view_count").notNull().default(0),
    locale: text("locale").notNull().default("en"),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqBrandSlug: uniqueIndex("uq_changelog_brand_slug").on(t.brandId, t.slug),
    idxBrandStatus: index("idx_changelog_brand_status").on(t.brandId, t.status),
    idxOrgBrand: index("idx_changelog_org_brand").on(t.orgId, t.brandId),
  }),
);

export type ChangelogEntryRow = typeof changelogEntries.$inferSelect;
