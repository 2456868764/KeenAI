import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Tracks applied Postgres migrations (dual-dialect bootstrap). */
export const pgSchemaMeta = pgTable("keenai_schema_meta", {
  id: text("id").primaryKey(),
  dialect: text("dialect").notNull().default("postgres"),
  version: text("version").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});
