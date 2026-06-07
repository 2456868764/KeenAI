import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, workflowRuns, workflows } from "@keenai/storage/schema";
import {
  WORKFLOW_INNGEST_EVENTS,
  type WorkflowDefinition,
  type WorkflowStepResult,
  nextBlockAfter,
  resolveReplyButtonsNext,
  runWorkflow,
  workflowAutoCloseMsFromMinutes,
} from "@keenai/workflow";
import { and, eq } from "drizzle-orm";
import {
  createWorkflowActionHandlers,
  createWorkflowRunContext,
  patchCollectDataStep,
  patchCsatStep,
  patchReplyButtonsStep,
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

async function emitCsatRequest(payload: {
  workflowRunId: string;
  conversationId: string;
  orgId: string;
  brandId: string;
  stepId: string;
  waitForRating: boolean;
  waitForRatingMs?: number;
}): Promise<void> {
  try {
    const { getInngestClient } = await import("./workflow-dispatch.js");
    const client = getInngestClient();
    if (!client) return;
    await client.send({ name: WORKFLOW_INNGEST_EVENTS.CSAT_REQUEST, data: payload });
  } catch {
    // Inngest is optional in dev/test
  }
}

function autoCloseMsForBlock(definition: WorkflowDefinition, blockId: string): number {
  const block = definition.blocks.find((item) => item.id === blockId);
  if (!block || (block.type !== "collect_data" && block.type !== "reply_buttons")) return 0;
  if (!block.autoCloseMinutes) return 0;
  return workflowAutoCloseMsFromMinutes(block.autoCloseMinutes);
}

async function finalizeResumedRun(
  db: Db,
  input: {
    runId: string;
    definition: WorkflowDefinition;
    conversationId: string;
    orgId: string;
    brandId: string;
    steps: WorkflowStepResult[];
    suspended?: { blockId: string; type: "collect_data" | "reply_buttons" | "csat" };
  },
): Promise<string> {
  const status = resolveRunStatus(input.steps, Boolean(input.suspended));
  await db
    .update(workflowRuns)
    .set({ status, steps: input.steps })
    .where(eq(workflowRuns.id, input.runId));

  if (input.suspended) {
    const block = input.definition.blocks.find((item) => item.id === input.suspended?.blockId);
    if (input.suspended.type === "csat" && block?.type === "csat" && block.waitForRatingMinutes) {
      await emitCsatRequest({
        workflowRunId: input.runId,
        conversationId: input.conversationId,
        orgId: input.orgId,
        brandId: input.brandId,
        stepId: block.id,
        waitForRating: true,
        waitForRatingMs: block.waitForRatingMinutes * 60_000,
      });
    } else {
      const autoCloseMs = autoCloseMsForBlock(input.definition, input.suspended.blockId);
      if (autoCloseMs > 0) {
        await emitWorkflowAwaitingInput({
          workflowRunId: input.runId,
          conversationId: input.conversationId,
          orgId: input.orgId,
          brandId: input.brandId,
          autoCloseMs,
        });
      }
    }
  }

  return status;
}

async function resumeFromSuspendedBlock(
  db: Db,
  input: {
    orgId: string;
    workflowRunId: string;
    blockId: string;
    expectedType: "collect_data" | "reply_buttons" | "csat";
    resumeFrom: string | null;
    patchedSteps: WorkflowStepResult[];
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
    (step) => step.blockId === input.blockId && step.type === input.expectedType,
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
    startBlockId: input.resumeFrom,
    initialSteps: input.patchedSteps,
  });

  const status = await finalizeResumedRun(db, {
    runId: run.id,
    definition,
    conversationId: conversation.id,
    orgId: workflow.orgId,
    brandId: conversation.brandId,
    steps: result.steps,
    suspended: result.suspended,
  });

  return { resumed: true, status };
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

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, run.workflowId), eq(workflows.orgId, input.orgId)))
    .limit(1);
  if (!workflow) return { resumed: false, reason: "workflow_not_found" };

  const definition = resolveActiveWorkflowDefinition(workflow);
  const patchedSteps = patchCollectDataStep(run.steps as WorkflowStepResult[], input.blockId, {
    attributes: input.attributes,
    freeText: input.freeText,
  });

  return resumeFromSuspendedBlock(
    db,
    {
      orgId: input.orgId,
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      expectedType: "collect_data",
      resumeFrom: nextBlockAfter(definition, input.blockId),
      patchedSteps,
    },
    env,
    authConfig,
  );
}

export async function resumeReplyButtonsWorkflow(
  db: Db,
  input: {
    orgId: string;
    workflowRunId: string;
    blockId: string;
    buttonId: string;
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

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, run.workflowId), eq(workflows.orgId, input.orgId)))
    .limit(1);
  if (!workflow) return { resumed: false, reason: "workflow_not_found" };

  const definition = resolveActiveWorkflowDefinition(workflow);
  const block = definition.blocks.find((item) => item.id === input.blockId);
  if (!block || block.type !== "reply_buttons") {
    return { resumed: false, reason: "block_not_reply_buttons" };
  }

  const button = block.buttons.find((item) => item.id === input.buttonId);
  if (!button) return { resumed: false, reason: "button_not_found" };

  const patchedSteps = patchReplyButtonsStep(run.steps as WorkflowStepResult[], input.blockId, {
    buttonId: input.buttonId,
    buttonLabel: button.label,
    nextBlockId: resolveReplyButtonsNext(block, input.buttonId),
  });

  return resumeFromSuspendedBlock(
    db,
    {
      orgId: input.orgId,
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      expectedType: "reply_buttons",
      resumeFrom: resolveReplyButtonsNext(block, input.buttonId),
      patchedSteps,
    },
    env,
    authConfig,
  );
}

export async function resumeCsatWorkflow(
  db: Db,
  input: {
    orgId: string;
    workflowRunId: string;
    blockId: string;
    rating: number;
    ratingComment?: string;
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

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, run.workflowId), eq(workflows.orgId, input.orgId)))
    .limit(1);
  if (!workflow) return { resumed: false, reason: "workflow_not_found" };

  const definition = resolveActiveWorkflowDefinition(workflow);
  const patchedSteps = patchCsatStep(run.steps as WorkflowStepResult[], input.blockId, {
    rating: input.rating,
    ratingComment: input.ratingComment,
  });

  return resumeFromSuspendedBlock(
    db,
    {
      orgId: input.orgId,
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      expectedType: "csat",
      resumeFrom: nextBlockAfter(definition, input.blockId),
      patchedSteps,
    },
    env,
    authConfig,
  );
}

export { autoCloseMsForBlock, emitCsatRequest, emitWorkflowAwaitingInput, resolveRunStatus };
