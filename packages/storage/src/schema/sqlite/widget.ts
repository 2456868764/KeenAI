import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const WIDGET_MODULE_KEYS = ["home", "messages", "help", "changelog", "tickets"] as const;
export type WidgetModuleKey = (typeof WIDGET_MODULE_KEYS)[number];

export const WIDGET_MENU_ITEM_TYPES = ["module", "external"] as const;
export type WidgetMenuItemType = (typeof WIDGET_MENU_ITEM_TYPES)[number];

export const WIDGET_MENU_LOCATIONS = ["bottom_nav", "home_card", "portal_menu"] as const;
export type WidgetMenuLocation = (typeof WIDGET_MENU_LOCATIONS)[number];

export const WIDGET_QUICK_ACTION_TYPES = [
  "start_chat",
  "submit_ticket",
  "open_help",
  "open_url",
] as const;
export type WidgetQuickActionType = (typeof WIDGET_QUICK_ACTION_TYPES)[number];

export const WIDGET_FEATURED_CONTENT_TYPES = ["kb_article", "changelog_entry", "external"] as const;
export type WidgetFeaturedContentType = (typeof WIDGET_FEATURED_CONTENT_TYPES)[number];

export const widgetSettings = sqliteTable(
  "widget_settings",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    primaryColor: text("primary_color").notNull().default("#7c5cff"),
    launcherIconUrl: text("launcher_icon_url"),
    agentName: text("agent_name").notNull().default("Keeni AI Agent"),
    agentSubtitle: text("agent_subtitle").notNull().default("The team can also help"),
    agentAvatarUrl: text("agent_avatar_url"),
    greetingTitle: text("greeting_title").notNull().default("Hey! How can we help?"),
    greetingBody: text("greeting_body")
      .notNull()
      .default("Ask a question, submit a ticket, or browse help articles."),
    homeEnabled: integer("home_enabled", { mode: "boolean" }).notNull().default(true),
    messagesEnabled: integer("messages_enabled", { mode: "boolean" }).notNull().default(true),
    helpEnabled: integer("help_enabled", { mode: "boolean" }).notNull().default(true),
    changelogEnabled: integer("changelog_enabled", { mode: "boolean" }).notNull().default(true),
    ticketsEnabled: integer("tickets_enabled", { mode: "boolean" }).notNull().default(true),
    poweredByEnabled: integer("powered_by_enabled", { mode: "boolean" }).notNull().default(true),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqBrand: uniqueIndex("uq_widget_settings_brand").on(t.brandId),
    idxOrg: index("idx_widget_settings_org").on(t.orgId),
  }),
);

export type WidgetSettingsRow = typeof widgetSettings.$inferSelect;

export const widgetMenuItems = sqliteTable(
  "widget_menu_items",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    settingsId: text("settings_id")
      .notNull()
      .references(() => widgetSettings.id),
    label: text("label").notNull(),
    description: text("description"),
    icon: text("icon"),
    itemType: text("item_type").$type<WidgetMenuItemType>().notNull(),
    moduleKey: text("module_key").$type<WidgetModuleKey>(),
    href: text("href"),
    location: text("location").$type<WidgetMenuLocation>().notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...sqliteTimestamps,
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

export type WidgetMenuItemRow = typeof widgetMenuItems.$inferSelect;

export const widgetQuickActions = sqliteTable(
  "widget_quick_actions",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    settingsId: text("settings_id")
      .notNull()
      .references(() => widgetSettings.id),
    label: text("label").notNull(),
    actionType: text("action_type").$type<WidgetQuickActionType>().notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxBrand: index("idx_widget_quick_actions_brand").on(t.brandId, t.sortOrder),
    idxSettings: index("idx_widget_quick_actions_settings").on(t.settingsId),
  }),
);

export type WidgetQuickActionRow = typeof widgetQuickActions.$inferSelect;

export const widgetFeaturedContent = sqliteTable(
  "widget_featured_content",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    settingsId: text("settings_id")
      .notNull()
      .references(() => widgetSettings.id),
    contentType: text("content_type").$type<WidgetFeaturedContentType>().notNull(),
    contentId: text("content_id"),
    titleOverride: text("title_override"),
    imageUrl: text("image_url"),
    href: text("href"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxBrand: index("idx_widget_featured_content_brand").on(t.brandId, t.contentType, t.sortOrder),
    idxSettings: index("idx_widget_featured_content_settings").on(t.settingsId),
  }),
);

export type WidgetFeaturedContentRow = typeof widgetFeaturedContent.$inferSelect;
