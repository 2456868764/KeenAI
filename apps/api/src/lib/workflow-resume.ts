import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, workflowRuns, workflows } from "@keenai/storage/schema";
import {
  WORKFLOW_INNGEST_EVENTS,
  type WorkflowStepResult,
  nextBlockAfter,
  runWorkflow,
  workflowAutoCloseMsFromMinutes,
} from "@keenai/workflow";
import { and, eq } from "drizzle-orm";
import {
  createWorkflowActionHandlers,
  createWorkflowRunContext,
  patchCollectDataStep,
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

export async function resumeCollectDataWorkflow(
  db: Db,
  input: {
    orgId: string;
    workflowRunId: string;
    blockId: string;
    attributes: Record<string, string>;
    freeText?: string;
  },
  env: ApiEnv,
  authConfig?: AuthConfig,
): Promise<{ resumed: boolean; status?: string; reason?: string }> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, input.workflowRunId), eq(workflowRuns.orgId, input.orgId)))
    .limit(1);

  if (!run) return { resumed: false, reason: "run_not_found" };
  if (run.status !== "awaiting_input") return { resumed: false, reason: "run_not_awaiting_input" };

  const existingSteps = run.steps as WorkflowStepResult[];
  const suspendedStep = existingSteps.find(
    (step) => step.blockId === input.blockId && step.type === "collect_data",
  );
  if (!suspendedStep?.output?.awaitingInput) {
    return { resumed: false, reason: "block_not_awaiting_input" };
  }

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, run.workflowId), eq(workflows.orgId, input.orgId)))
    .limit(1);
  if (!workflow) return { resumed: false, reason: "workflow_not_found" };

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, run.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);
  if (!conversation) return { resumed: false, reason: "conversation_not_found" };

  const definition = resolveActiveWorkflowDefinition(workflow);
  const patchedSteps = patchCollectDataStep(existingSteps, input.blockId, {
    attributes: input.attributes,
    freeText: input.freeText,
  });
  const resumeFrom = nextBlockAfter(definition, input.blockId);
  const handlers = createWorkflowActionHandlers(
    db,
    workflow,
    conversation,
    env,
    authConfig,
    run.id,
  );
  const context = createWorkflowRunContext(workflow, conversation, run.id);

  const result = await runWorkflow(definition, handlers, context, {
    startBlockId: resumeFrom,
    initialSteps: patchedSteps,
  });

  const status = resolveRunStatus(result.steps, Boolean(result.suspended));
  await db
    .update(workflowRuns)
    .set({ status, steps: result.steps })
    .where(eq(workflowRuns.id, run.id));

  if (result.suspended?.type === "collect_data") {
    const block = definition.blocks.find((item) => item.id === result.suspended?.blockId);
    const autoCloseMinutes = block?.type === "collect_data" ? block.autoCloseMinutes : undefined;
    if (autoCloseMinutes) {
      await emitWorkflowAwaitingInput({
        workflowRunId: run.id,
        conversationId: conversation.id,
        orgId: workflow.orgId,
        brandId: conversation.brandId,
        autoCloseMs: workflowAutoCloseMsFromMinutes(autoCloseMinutes),
      });
    }
  }

  return { resumed: true, status };
}
