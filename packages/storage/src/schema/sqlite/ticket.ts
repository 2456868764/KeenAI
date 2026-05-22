import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { conversations } from "./conversation";
import { organizations } from "./core";

export const ticketTypes = sqliteTable(
  "ticket_types",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // customer | back_office | tracker
    icon: text("icon"),
    fields: text("fields", { mode: "json" }).$type<unknown[]>().default([]),
    statusIds: text("status_ids", { mode: "json" }).$type<string[]>().default([]),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrg: index("idx_ticket_types_org").on(t.orgId),
  }),
);

export const ticketStatuses = sqliteTable(
  "ticket_statuses",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    category: text("category").notNull(), // under_review | active | waiting | done
    color: text("color"),
    isDefault: integer("is_default", { mode: "boolean" }).default(false),
    ticketTypeIds: text("ticket_type_ids", { mode: "json" }).$type<string[]>().default([]),
    sortOrder: integer("sort_order"),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrg: index("idx_ticket_statuses_org").on(t.orgId),
  }),
);

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    typeId: text("type_id")
      .notNull()
      .references(() => ticketTypes.id),
    title: text("title").notNull(),
    description: text("description", { mode: "json" }),
    statusId: text("status_id").references(() => ticketStatuses.id),
    priority: text("priority").default("normal"),
    assigneeId: text("assignee_id"),
    teamId: text("team_id"),
    reporterId: text("reporter_id"),
    customerId: text("customer_id"),
    customFields: text("custom_fields", { mode: "json" })
      .$type<Record<string, unknown>>()
      .default({}),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrgStatus: index("idx_tickets_org_status").on(t.orgId, t.statusId),
    idxAssignee: index("idx_tickets_assignee").on(t.assigneeId),
  }),
);

export const ticketConversations = sqliteTable(
  "ticket_conversations",
  {
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    relationship: text("relationship").notNull().default("primary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ticketId, t.conversationId] }),
  }),
);

export const ticketLinks = sqliteTable(
  "ticket_links",
  {
    parentId: text("parent_id")
      .notNull()
      .references(() => tickets.id),
    childId: text("child_id")
      .notNull()
      .references(() => tickets.id),
    linkType: text("link_type").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.parentId, t.childId, t.linkType] }),
  }),
);

export const ticketEvents = sqliteTable(
  "ticket_events",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id),
    eventType: text("event_type").notNull(),
    actorId: text("actor_id"),
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxTicket: index("idx_ticket_events_ticket").on(t.ticketId, t.createdAt),
  }),
);
