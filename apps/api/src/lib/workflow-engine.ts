import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, workflowRuns, workflows } from "@keenai/storage/schema";
import {
  WORKFLOW_INNGEST_EVENTS,
  type WorkflowStepResult,
  runWorkflow,
  workflowAutoCloseMsFromMinutes,
} from "@keenai/workflow";
import { and, desc, eq } from "drizzle-orm";
import {
  createWorkflowActionHandlers,
  createWorkflowRunContext,
  resolveActiveWorkflowDefinition,
} from "./workflow-handlers.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

async function emitWorkflowAwaitingInput(payload: {
  workflowRunId: string;
  conversationId: string;
  orgId: string;
  brandId: string;
  autoCloseMs: number;
}): Promise<void> {
  if (payload.autoCloseMs <= 0) return;
  try {
    const { getInngestClient } = await import("./workflow-dispatch.js");
    const client = getInngestClient();
    if (!client) return;
    await client.send({ name: WORKFLOW_INNGEST_EVENTS.STEP_AWAITING_INPUT, data: payload });
  } catch {
    // Inngest is optional in dev/test
  }
}

function resolveRunStatus(steps: WorkflowStepResult[], suspended?: boolean): string {
  if (suspended) return "awaiting_input";
  if (steps.some((step) => step.status === "error")) return "failed";
  return "completed";
}

export async function executeWorkflow(
  db: Db,
  workflow: typeof workflows.$inferSelect,
  conversationId: string,
  env: ApiEnv,
  authConfig?: AuthConfig,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, workflow.orgId)))
    .limit(1);

  if (!conversation) return null;

  const definition = resolveActiveWorkflowDefinition(workflow);

  const [run] = await db
    .insert(workflowRuns)
    .values({
      orgId: workflow.orgId,
      workflowId: workflow.id,
      conversationId,
      status: "running",
      steps: [],
    })
    .returning();
  if (!run) return null;

  const handlers = createWorkflowActionHandlers(
    db,
    workflow,
    conversation,
    env,
    authConfig,
    run.id,
  );
  const context = createWorkflowRunContext(workflow, conversation, run.id);

  const result = await runWorkflow(definition, handlers, context);
  const status = resolveRunStatus(result.steps, Boolean(result.suspended));

  const [updated] = await db
    .update(workflowRuns)
    .set({ status, steps: result.steps })
    .where(eq(workflowRuns.id, run.id))
    .returning();

  if (result.suspended?.type === "collect_data") {
    const block = definition.blocks.find((item) => item.id === result.suspended?.blockId);
    const autoCloseMinutes = block?.type === "collect_data" ? block.autoCloseMinutes : undefined;
    if (autoCloseMinutes) {
      await emitWorkflowAwaitingInput({
        workflowRunId: run.id,
        conversationId,
        orgId: workflow.orgId,
        brandId: conversation.brandId,
        autoCloseMs: workflowAutoCloseMsFromMinutes(autoCloseMinutes),
      });
    }
  }

  return updated ?? null;
}

export async function dispatchFirstMessageWorkflows(
  db: Db,
  input: { orgId: string; brandId: string; conversationId: string },
  env: ApiEnv,
  authConfig?: AuthConfig,
) {
  const rows = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, input.orgId),
        eq(workflows.status, "published"),
        eq(workflows.trigger, "first_message"),
      ),
    )
    .orderBy(desc(workflows.updatedAt));

  const runs = [];
  for (const workflow of rows) {
    if (workflow.brandId && workflow.brandId !== input.brandId) continue;
    const run = await executeWorkflow(db, workflow, input.conversationId, env, authConfig);
    if (run) runs.push(run);
  }
  return runs;
}

export function serializeWorkflowRun(row: typeof workflowRuns.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    workflowId: row.workflowId,
    conversationId: row.conversationId,
    status: row.status,
    steps: row.steps,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeWorkflow(row: typeof workflows.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    name: row.name,
    trigger: row.trigger,
    definition: row.definition,
    publishedDefinition: row.publishedDefinition ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { resolveActiveWorkflowDefinition } from "./workflow-handlers.js";
