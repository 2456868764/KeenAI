import type { AgentAbandonedWorkflowTrigger } from "@keenai/shared";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { conversations } from "./conversation";
import { brands, organizations } from "./core";

export const CONVERSATION_AUTO_CLOSE_JOB_KINDS = ["resolved", "workflow_abandoned"] as const;
export type ConversationAutoCloseJobKind = (typeof CONVERSATION_AUTO_CLOSE_JOB_KINDS)[number];

export const CONVERSATION_AUTO_CLOSE_JOB_STATUSES = [
  "pending",
  "processing",
  "completed",
  "cancelled",
  "skipped",
  "failed",
] as const;
export type ConversationAutoCloseJobStatus = (typeof CONVERSATION_AUTO_CLOSE_JOB_STATUSES)[number];

export const agentOtherSettings = sqliteTable(
  "agent_other_settings",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    simpleDeployEnabled: integer("simple_deploy_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    allowHandoff: integer("allow_handoff", { mode: "boolean" }).notNull().default(true),
    autoCloseResolvedEnabled: integer("auto_close_resolved_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    autoCloseResolvedDelayMinutes: integer("auto_close_resolved_delay_minutes")
      .notNull()
      .default(7),
    abandonedWorkflowTriggers: text("abandoned_workflow_triggers", { mode: "json" })
      .$type<AgentAbandonedWorkflowTrigger[]>()
      .notNull()
      .default([]),
    abandonedWorkflowDelayMinutes: integer("abandoned_workflow_delay_minutes")
      .notNull()
      .default(10),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqBrand: uniqueIndex("uq_agent_other_settings_brand").on(table.brandId),
    idxOrg: index("idx_agent_other_settings_org").on(table.orgId),
  }),
);

export type AgentOtherSettingsRow = typeof agentOtherSettings.$inferSelect;

export const conversationAutoCloseJobs = sqliteTable(
  "conversation_auto_close_jobs",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    kind: text("kind").$type<ConversationAutoCloseJobKind>().notNull(),
    status: text("status").$type<ConversationAutoCloseJobStatus>().notNull().default("pending"),
    policySource: text("policy_source").$type<"brand" | "block">().notNull().default("brand"),
    dedupeKey: text("dedupe_key").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    basisMessageId: text("basis_message_id"),
    basisLastMessageAt: integer("basis_last_message_at", { mode: "timestamp_ms" }),
    workflowRunId: text("workflow_run_id"),
    workflowBlockId: text("workflow_block_id"),
    workflowTrigger: text("workflow_trigger"),
    agentRunId: text("agent_run_id"),
    resolutionType: text("resolution_type"),
    attempts: integer("attempts").notNull().default(0),
    reason: text("reason"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (table) => ({
    uqDedupeKey: uniqueIndex("uq_conversation_auto_close_jobs_dedupe").on(table.dedupeKey),
    idxDue: index("idx_conversation_auto_close_jobs_due").on(table.status, table.dueAt),
    idxConversation: index("idx_conversation_auto_close_jobs_conversation").on(
      table.conversationId,
      table.status,
    ),
    idxBrand: index("idx_conversation_auto_close_jobs_brand").on(table.brandId, table.status),
  }),
);

export type ConversationAutoCloseJobRow = typeof conversationAutoCloseJobs.$inferSelect;
