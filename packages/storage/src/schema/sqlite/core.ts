import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey().$defaultFn(newUlid),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  settings: text("settings", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  ...sqliteTimestamps,
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export const brands = sqliteTable(
  "brands",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    theme: text("theme", { mode: "json" })
      .$type<{ colors?: Record<string, string>; fonts?: string[] }>()
      .notNull()
      .default({}),
    locale: text("locale").default("en"),
    emailFrom: text("email_from"),
    settings: text("settings", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqSlug: uniqueIndex("uq_brands_org_slug").on(t.orgId, t.slug),
    idxOrg: index("idx_brands_org").on(t.orgId),
  }),
);

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey().$defaultFn(newUlid),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  icon: text("icon"),
  description: text("description"),
  ...sqliteTimestamps,
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey().$defaultFn(newUlid),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  locale: text("locale").default("en"),
  timezone: text("timezone").default("UTC"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).default(false),
  mfaSecret: text("mfa_secret"),
  ...sqliteTimestamps,
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    role: text("role").notNull(),
    seatType: text("seat_type").notNull().default("full"),
    permissions: text("permissions", { mode: "json" }).$type<string[] | null>(),
    status: text("status").notNull().default("active"),
    invitedBy: text("invited_by").references(() => accounts.id),
    invitedAt: integer("invited_at", { mode: "timestamp_ms" }),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (t) => ({
    uq: uniqueIndex("uq_members_org_account").on(t.orgId, t.accountId),
    idxOrg: index("idx_members_org").on(t.orgId),
  }),
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    role: text("role"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.memberId] }),
  }),
);
