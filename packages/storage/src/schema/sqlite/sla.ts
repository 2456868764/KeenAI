import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { conversations } from "./conversation";
import { organizations } from "./core";

export type OfficeHoursSchedule = Record<string, { start: string; end: string }[] | undefined>;

export const slaPolicies = sqliteTable(
  "sla_policies",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    firstResponseSec: integer("first_response_sec"),
    resolutionSec: integer("resolution_sec"),
    operationalHoursOnly: integer("operational_hours_only", { mode: "boolean" })
      .notNull()
      .default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrg: index("idx_sla_policies_org").on(t.orgId),
  }),
);

export const officeHours = sqliteTable(
  "office_hours",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    timezone: text("timezone").notNull().default("UTC"),
    schedule: text("schedule", { mode: "json" }).$type<OfficeHoursSchedule>().notNull().default({}),
    holidays: text("holidays", { mode: "json" }).$type<string[]>().notNull().default([]),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrg: index("idx_office_hours_org").on(t.orgId),
  }),
);

export const slaBreachEvents = sqliteTable(
  "sla_breach_events",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    policyId: text("policy_id").references(() => slaPolicies.id),
    metric: text("metric").notNull(),
    thresholdPct: integer("threshold_pct").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    breachedAt: integer("breached_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxConv: index("idx_sla_breach_conv").on(t.conversationId, t.metric),
  }),
);
