import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const HELP_ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type HelpArticleStatus = (typeof HELP_ARTICLE_STATUSES)[number];

export const helpCollections = sqliteTable(
  "help_collections",
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
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    public: integer("public", { mode: "boolean" }).notNull().default(true),
    locale: text("locale").notNull().default("en"),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqBrandSlugLocale: uniqueIndex("uq_help_coll_brand_slug_locale").on(
      t.brandId,
      t.slug,
      t.locale,
    ),
    idxOrgBrand: index("idx_help_coll_org_brand").on(t.orgId, t.brandId),
  }),
);

export type HelpCollectionRow = typeof helpCollections.$inferSelect;

export const helpArticles = sqliteTable(
  "help_articles",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    collectionId: text("collection_id").references(() => helpCollections.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    content: text("content", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    plainText: text("plain_text").notNull().default(""),
    excerpt: text("excerpt"),
    status: text("status").$type<HelpArticleStatus>().notNull().default("draft"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    kbDocumentId: text("kb_document_id"),
    locale: text("locale").notNull().default("en"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    authorMemberId: text("author_member_id"),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqBrandSlugLocale: uniqueIndex("uq_help_articles_brand_slug_locale").on(
      t.brandId,
      t.slug,
      t.locale,
    ),
    idxBrandStatus: index("idx_help_articles_brand_status").on(t.brandId, t.status),
    idxCollection: index("idx_help_articles_collection").on(t.collectionId),
  }),
);

export type HelpArticleRow = typeof helpArticles.$inferSelect;
