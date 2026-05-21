import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { newUlid } from "../_shared/ulid";
import { members, organizations } from "./core";
import { conversations } from "./conversation";

export const copilotEvents = sqliteTable(
  "copilot_events",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    action: text("action").notNull(),
    draftLength: integer("draft_length"),
    providerId: text("provider_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxConv: index("idx_copilot_events_conv").on(t.conversationId, t.createdAt),
    idxOrg: index("idx_copilot_events_org").on(t.orgId, t.createdAt),
  }),
);
