import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const CUSTOM_ACTION_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const CUSTOM_ACTION_AUTH_TYPES = ["none", "bearer", "hmac", "basic"] as const;
export const CUSTOM_ACTION_SANDBOXES = ["http_direct", "workers", "isolated_vm"] as const;

export type CustomActionHttpMethod = (typeof CUSTOM_ACTION_HTTP_METHODS)[number];
export type CustomActionAuthType = (typeof CUSTOM_ACTION_AUTH_TYPES)[number];
export type CustomActionSandbox = (typeof CUSTOM_ACTION_SANDBOXES)[number];

/** User-configured HTTP tool definitions for agent function calling (Sprint 16). */
export const customActions = sqliteTable(
  "custom_actions",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    name: text("name").notNull(),
    description: text("description"),
    whenToUse: text("when_to_use"),
    parametersSchema: text("parameters_schema", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({ type: "object", properties: {} }),
    endpoint: text("endpoint").notNull(),
    method: text("method").$type<CustomActionHttpMethod>().notNull().default("POST"),
    headers: text("headers", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    authType: text("auth_type").$type<CustomActionAuthType>().notNull().default("none"),
    authSecretRef: text("auth_secret_ref"),
    dataAccess: text("data_access", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sandbox: text("sandbox").$type<CustomActionSandbox>().notNull().default("http_direct"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by"),
    ...sqliteTimestamps,
  },
  (t) => ({
    brandIdx: index("idx_custom_actions_brand").on(t.orgId, t.brandId, t.enabled),
    nameUq: uniqueIndex("uq_custom_actions_brand_name").on(t.orgId, t.brandId, t.name),
  }),
);

export type CustomActionRow = typeof customActions.$inferSelect;

export const CUSTOM_ACTION_LOG_SOURCES = ["api", "copilot"] as const;
export type CustomActionLogSource = (typeof CUSTOM_ACTION_LOG_SOURCES)[number];

/** Audit trail for custom action executions (Sprint 16 · CA-05). */
export const customActionLogs = sqliteTable(
  "custom_action_logs",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    actionId: text("action_id")
      .notNull()
      .references(() => customActions.id, { onDelete: "cascade" }),
    actionName: text("action_name").notNull(),
    source: text("source").$type<CustomActionLogSource>().notNull(),
    triggeredBy: text("triggered_by"),
    conversationId: text("conversation_id"),
    parameters: text("parameters", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requestUrl: text("request_url").notNull(),
    requestMethod: text("request_method").notNull(),
    responseStatus: integer("response_status").notNull().default(0),
    ok: integer("ok", { mode: "boolean" }).notNull().default(false),
    resultData: text("result_data", { mode: "json" }).$type<unknown>(),
    filtered: integer("filtered", { mode: "boolean" }).notNull().default(false),
    errorCode: text("error_code"),
    durationMs: integer("duration_ms").notNull(),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    actionIdx: index("idx_custom_action_logs_action").on(t.actionId, t.createdAt),
    orgIdx: index("idx_custom_action_logs_org").on(t.orgId, t.createdAt),
  }),
);

export type CustomActionLogRow = typeof customActionLogs.$inferSelect;
