import { buildStructuredAgentPlan } from "@keenai/agent";
import type { DraftToolRuntime } from "@keenai/llm";
import type { KeenaiDb } from "@keenai/storage";
import type { WorkflowToolExecutionMode } from "@keenai/workflow";
import {
  createAgentRun,
  loadAgentToolPolicyRules,
  persistAgentContext,
  persistAgentPlan,
  transitionAgentRun,
} from "./agent-audit-store.js";
import { type AuditedToolCallResult, executeAuditedToolCall } from "./agent-runtime.js";

export type WorkflowToolCallInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  workflowId: string;
  workflowRunId: string;
  blockId: string;
  executionMode: WorkflowToolExecutionMode;
  tool: DraftToolRuntime;
  arguments: Record<string, unknown>;
  existingRunId?: string;
  actorId?: string | null;
  channel?: string | null;
};

export type GovernedToolCallInput = {
  orgId: string;
  brandId?: string | null;
  conversationId?: string | null;
  workflowRunId?: string | null;
  trigger: string;
  actorType: string;
  actorId?: string | null;
  actorRole?: string | null;
  channel?: string | null;
  executionMode: WorkflowToolExecutionMode;
  tool: DraftToolRuntime;
  arguments: Record<string, unknown>;
  inputSnapshot: Record<string, unknown>;
  idempotencyScope?: string;
  existingRunId?: string;
};

export async function executeGovernedToolCall(
  db: KeenaiDb,
  input: GovernedToolCallInput,
): Promise<AuditedToolCallResult> {
  const run = input.existingRunId
    ? { id: input.existingRunId, toolBudget: 1 }
    : await createAgentRun(db, {
        orgId: input.orgId,
        brandId: input.brandId,
        conversationId: input.conversationId,
        workflowRunId: input.workflowRunId,
        trigger: input.trigger,
        actorType: input.actorType,
        actorId: input.actorId,
        toolBudget: 1,
        inputSnapshot: input.inputSnapshot,
      });

  if (!input.existingRunId) {
    await transitionAgentRun(db, {
      runId: run.id,
      orgId: input.orgId,
      status: "planning",
      phase: "plan",
      eventType: "plan.started",
      payload: { trigger: input.trigger, toolName: input.tool.name },
    });
    const plan = buildStructuredAgentPlan({
      intent: "procedural",
      instruction: `Execute ${input.tool.name}`,
      tools: [input.tool],
    });
    await persistAgentPlan(db, { runId: run.id, orgId: input.orgId, plan });
    await persistAgentContext(db, {
      runId: run.id,
      orgId: input.orgId,
      memoryScope: input.trigger,
      intent: "procedural",
      weights: {},
      sections: [],
      text: "",
    });
  } else {
    await transitionAgentRun(db, {
      runId: run.id,
      orgId: input.orgId,
      status: "retrieving",
      phase: "retrieve",
      eventType: "run.resumed",
      payload: { actorId: input.actorId ?? null },
    });
  }

  const rules = await loadAgentToolPolicyRules(db, {
    orgId: input.orgId,
    brandId: input.brandId,
  });
  return executeAuditedToolCall({
    db,
    identity: {
      runId: run.id,
      orgId: input.orgId,
      conversationId: input.conversationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      channel: input.channel,
      toolBudget: run.toolBudget,
      idempotencyScope: input.idempotencyScope,
    },
    tool: input.tool,
    args: input.arguments,
    policyRules: rules,
    executionMode: input.executionMode,
  });
}

/** Execute one deterministic workflow tool through the same policy and audit gateway as agents. */
export async function executeWorkflowToolCall(
  db: KeenaiDb,
  input: WorkflowToolCallInput,
): Promise<AuditedToolCallResult> {
  return executeGovernedToolCall(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
    workflowRunId: input.workflowRunId,
    trigger: "workflow_tool",
    actorType: "workflow",
    actorId: input.actorId,
    actorRole: "workflow",
    channel: input.channel,
    executionMode: input.executionMode,
    tool: input.tool,
    arguments: input.arguments,
    existingRunId: input.existingRunId,
    idempotencyScope: `${input.workflowRunId}:${input.blockId}`,
    inputSnapshot: {
      source: "workflow",
      workflowId: input.workflowId,
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      executionMode: input.executionMode,
      toolName: input.tool.name,
      toolSource: input.tool.audit?.source ?? "workflow",
      arguments: input.arguments,
    },
  });
}
