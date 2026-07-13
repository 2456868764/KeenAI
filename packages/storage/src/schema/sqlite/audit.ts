import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { newUlid } from "../_shared/ulid";
import { organizations } from "./core";

export const AUDIT_ACTOR_TYPES = ["account", "api_key", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    actorType: text("actor_type").$type<AuditActorType>(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    changes: text("changes", { mode: "json" }).$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxOrgAction: index("idx_audit_logs_org_action").on(t.orgId, t.action, t.createdAt),
    idxResource: index("idx_audit_logs_resource").on(t.resourceType, t.resourceId, t.createdAt),
  }),
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
