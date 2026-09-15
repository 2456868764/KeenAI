import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pgBrands, pgOrganizations } from "./core.js";

export const pgWidgetSettings = pgTable(
  "widget_settings",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => pgBrands.id),
    primaryColor: text("primary_color").notNull().default("#7c5cff"),
    launcherIconUrl: text("launcher_icon_url"),
    agentName: text("agent_name").notNull().default("Keeni AI Agent"),
    agentSubtitle: text("agent_subtitle").notNull().default("The team can also help"),
    agentAvatarUrl: text("agent_avatar_url"),
    greetingTitle: text("greeting_title").notNull().default("Hey! How can we help?"),
    greetingBody: text("greeting_body")
      .notNull()
      .default("Ask a question, submit a ticket, or browse help articles."),
    homeEnabled: boolean("home_enabled").notNull().default(true),
    messagesEnabled: boolean("messages_enabled").notNull().default(true),
    helpEnabled: boolean("help_enabled").notNull().default(true),
    changelogEnabled: boolean("changelog_enabled").notNull().default(true),
    ticketsEnabled: boolean("tickets_enabled").notNull().default(true),
    poweredByEnabled: boolean("powered_by_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqBrand: uniqueIndex("uq_widget_settings_brand").on(t.brandId),
    idxOrg: index("idx_widget_settings_org").on(t.orgId),
  }),
);

export const pgWidgetMenuItems = pgTable(
  "widget_menu_items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => pgBrands.id),
    settingsId: text("settings_id")
      .notNull()
      .references(() => pgWidgetSettings.id),
    label: text("label").notNull(),
    description: text("description"),
    icon: text("icon"),
    itemType: text("item_type").notNull(),
    moduleKey: text("module_key"),
    href: text("href"),
    location: text("location").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxBrandLocation: index("idx_widget_menu_items_brand_location").on(
      t.brandId,
      t.location,
      t.sortOrder,
    ),
    idxSettings: index("idx_widget_menu_items_settings").on(t.settingsId),
  }),
);

export const pgWidgetQuickActions = pgTable(
  "widget_quick_actions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => pgBrands.id),
    settingsId: text("settings_id")
      .notNull()
      .references(() => pgWidgetSettings.id),
    label: text("label").notNull(),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxBrand: index("idx_widget_quick_actions_brand").on(t.brandId, t.sortOrder),
    idxSettings: index("idx_widget_quick_actions_settings").on(t.settingsId),
  }),
);

export const pgWidgetFeaturedContent = pgTable(
  "widget_featured_content",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => pgBrands.id),
    settingsId: text("settings_id")
      .notNull()
      .references(() => pgWidgetSettings.id),
    contentType: text("content_type").notNull(),
    contentId: text("content_id"),
    titleOverride: text("title_override"),
    imageUrl: text("image_url"),
    href: text("href"),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxBrand: index("idx_widget_featured_content_brand").on(t.brandId, t.contentType, t.sortOrder),
    idxSettings: index("idx_widget_featured_content_settings").on(t.settingsId),
  }),
);
