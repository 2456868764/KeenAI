import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const pgOrganizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const pgBrands = pgTable(
  "brands",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    theme: jsonb("theme")
      .$type<{ colors?: Record<string, string>; fonts?: string[] }>()
      .notNull()
      .default({}),
    locale: text("locale").default("en"),
    emailFrom: text("email_from"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqOrgSlug: uniqueIndex("uq_brands_org_slug").on(t.orgId, t.slug),
    idxOrg: index("idx_brands_org").on(t.orgId),
  }),
);
