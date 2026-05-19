import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { newUlid } from "../_shared/ulid";
import { accounts, organizations } from "./core";

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxAccountRead: index("idx_notif_account_read").on(t.accountId, t.readAt),
    idxOrg: index("idx_notif_org").on(t.orgId, t.createdAt),
  }),
);
