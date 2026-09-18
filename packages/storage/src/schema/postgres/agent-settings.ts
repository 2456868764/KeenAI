import type { AgentAbandonedWorkflowTrigger } from "@keenai/shared";
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
import type {
  ConversationAutoCloseJobKind,
  ConversationAutoCloseJobStatus,
} from "../sqlite/agent-settings.js";
import { pgBrands, pgOrganizations } from "./core.js";

export const pgAgentOtherSettings = pgTable(
  "agent_other_settings",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => pgBrands.id),
    simpleDeployEnabled: boolean("simple_deploy_enabled").notNull().default(false),
    allowHandoff: boolean("allow_handoff").notNull().default(true),
    autoCloseResolvedEnabled: boolean("auto_close_resolved_enabled").notNull().default(true),
    autoCloseResolvedDelayMinutes: integer("auto_close_resolved_delay_minutes")
      .notNull()
      .default(7),
    abandonedWorkflowTriggers: jsonb("abandoned_workflow_triggers")
      .$type<AgentAbandonedWorkflowTrigger[]>()
      .notNull()
      .default([]),
    abandonedWorkflowDelayMinutes: integer("abandoned_workflow_delay_minutes")
      .notNull()
      .default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uqBrand: uniqueIndex("uq_agent_other_settings_brand").on(table.brandId),
    idxOrg: index("idx_agent_other_settings_org").on(table.orgId),
  }),
);

export const pgConversationAutoCloseJobs = pgTable(
  "conversation_auto_close_jobs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => pgOrganizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => pgBrands.id),
    conversationId: text("conversation_id").notNull(),
    kind: text("kind").$type<ConversationAutoCloseJobKind>().notNull(),
    status: text("status").$type<ConversationAutoCloseJobStatus>().notNull().default("pending"),
    policySource: text("policy_source").$type<"brand" | "block">().notNull().default("brand"),
    dedupeKey: text("dedupe_key").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    basisMessageId: text("basis_message_id"),
    basisLastMessageAt: timestamp("basis_last_message_at", { withTimezone: true }),
    workflowRunId: text("workflow_run_id"),
    workflowBlockId: text("workflow_block_id"),
    workflowTrigger: text("workflow_trigger"),
    agentRunId: text("agent_run_id"),
    resolutionType: text("resolution_type"),
    attempts: integer("attempts").notNull().default(0),
    reason: text("reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
