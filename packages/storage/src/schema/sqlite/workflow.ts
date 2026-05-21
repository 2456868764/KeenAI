import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { WorkflowDefinition } from "@keenai/workflow";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";
import { conversations } from "./conversation";

export const workflows = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id").references(() => brands.id),
    name: text("name").notNull(),
    trigger: text("trigger").notNull(),
    definition: text("definition", { mode: "json" }).$type<WorkflowDefinition>().notNull(),
    status: text("status").notNull().default("draft"),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxOrgStatus: index("idx_workflows_org_status").on(t.orgId, t.status),
    idxOrgTrigger: index("idx_workflows_org_trigger").on(t.orgId, t.trigger, t.status),
  }),
);

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    status: text("status").notNull().default("completed"),
    steps: text("steps", { mode: "json" })
      .$type<Array<{ blockId: string; type: string; status: string; error?: string }>>()
      .notNull()
      .default([]),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    idxConv: index("idx_workflow_runs_conv").on(t.conversationId, t.createdAt),
    idxWorkflow: index("idx_workflow_runs_workflow").on(t.workflowId, t.createdAt),
  }),
);
