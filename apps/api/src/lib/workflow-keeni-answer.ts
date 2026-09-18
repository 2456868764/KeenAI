import { buildStructuredAgentPlan, classifyToolRisk } from "@keenai/agent";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations } from "@keenai/storage/schema";
import {
  type LetKeeniAnswerInput,
  type LetKeeniAnswerResult,
  resolveLetKeeniAnswerNext,
} from "@keenai/workflow";
import { and, eq } from "drizzle-orm";
import {
  createAgentRun,
  loadAgentToolPolicyRules,
  persistAgentContext,
  persistAgentPlan,
  transitionAgentRun,
} from "./agent-audit-store.js";
import { executeAuditedAgentDraft } from "./agent-runtime.js";
import { getOrCreateAgentOtherSettings } from "./agent-settings.js";
import { createAppLlmRegistry } from "./app-llm-registry.js";
import { scheduleResolvedConversationAutoClose } from "./conversation-auto-close.js";
import { buildMessageContent, insertMessage } from "./conversations.js";
import { buildCopilotDraftRequest } from "./copilot-context.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

type AgentAnswerInvocation = {
  trigger: "workflow_let_keeni_answer" | "basic_agent";
  actorType: "workflow" | "system";
  actorRole: "workflow" | "system";
  source: "workflow" | "basic_agent";
  sentVia: "workflow" | "basic-agent";
  sourceMessageId?: string;
};

export async function runLetKeeniAnswerBlock(
  db: Db,
  env: ApiEnv,
  input: LetKeeniAnswerInput,
): Promise<LetKeeniAnswerResult> {
  return runAgentAnswer(db, env, input, {
    trigger: "workflow_let_keeni_answer",
    actorType: "workflow",
    actorRole: "workflow",
    source: "workflow",
    sentVia: "workflow",
  });
}

export async function runBasicAgentWorkflow(
  db: Db,
  env: ApiEnv,
  input: {
    orgId: string;
    brandId: string;
    conversationId: string;
    sourceMessageId?: string;
  },
): Promise<LetKeeniAnswerResult | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.orgId, input.orgId),
        eq(conversations.brandId, input.brandId),
      ),
    )
    .limit(1);
  if (!conversation) return null;

  return runAgentAnswer(
    db,
    env,
    {
      block: {
        id: "system-basic-agent-answer",
        type: "let_keeni_answer",
        maxSteps: 8,
      },
      context: {
        orgId: input.orgId,
        brandId: input.brandId,
        conversationId: input.conversationId,
        targetCustomerId: conversation.userId,
        subject: conversation.subject ?? undefined,
        channelType: conversation.channelType,
        toolExecutionMode: "governed",
      },
    },
    {
      trigger: "basic_agent",
      actorType: "system",
      actorRole: "system",
      source: "basic_agent",
      sentVia: "basic-agent",
      sourceMessageId: input.sourceMessageId,
    },
  );
}

async function runAgentAnswer(
  db: Db,
  env: ApiEnv,
  input: LetKeeniAnswerInput,
  invocation: AgentAnswerInvocation,
): Promise<LetKeeniAnswerResult> {
  const { block, context } = input;
  const executionMode = context.toolExecutionMode ?? "governed";
  const provider = createAppLlmRegistry(env).resolveDraftProvider();
  const run = await createAgentRun(db, {
    orgId: context.orgId,
    brandId: context.brandId,
    conversationId: context.conversationId,
    workflowRunId: context.workflowRunId,
    trigger: invocation.trigger,
    actorType: invocation.actorType,
    providerId: provider.id,
    maxIterations: block.maxSteps,
    inputSnapshot: {
      source: invocation.source,
      sourceMessageId: invocation.sourceMessageId,
      workflowRunId: context.workflowRunId,
      blockId: block.id,
      conversationId: context.conversationId,
      instruction: block.instructions,
      toolFilter: block.toolFilter,
      toolExecutionMode: executionMode,
      channelType: context.channelType,
    },
  });
  await transitionAgentRun(db, {
    runId: run.id,
    orgId: context.orgId,
    status: "planning",
    phase: "plan",
    eventType: "plan.started",
  });
  const { request, memoryScope, auditContext } = await buildCopilotDraftRequest(db, env, {
    conversationId: context.conversationId,
    orgId: context.orgId,
    brandId: context.brandId,
    userId: context.targetCustomerId,
    subject: context.subject,
    instruction: block.instructions,
  });

  if (block.toolFilter?.length) {
    request.tools = request.tools?.filter((tool) => block.toolFilter?.includes(tool.name));
  }
  if (executionMode === "read_only") {
    request.tools = request.tools?.filter((tool) => classifyToolRisk(tool) === "r0");
  }

  const plan = buildStructuredAgentPlan({
    intent: auditContext.intent,
    instruction: block.instructions,
    subject: context.subject,
    tools: request.tools,
  });
  await persistAgentPlan(db, { runId: run.id, orgId: context.orgId, plan });
  const contextSnapshot = await persistAgentContext(db, {
    runId: run.id,
    orgId: context.orgId,
    memoryScope,
    intent: auditContext.intent,
    weights: auditContext.weights,
    sections: auditContext.sections,
    text: auditContext.text,
  });
  const policyRules = await loadAgentToolPolicyRules(db, {
    orgId: context.orgId,
    brandId: context.brandId,
  });
  const result = await executeAuditedAgentDraft({
    db,
    identity: {
      runId: run.id,
      orgId: context.orgId,
      conversationId: context.conversationId,
      actorRole: invocation.actorRole,
      channel: context.channelType,
      toolBudget: run.toolBudget,
    },
    provider,
    request,
    plan,
    evidenceCount: contextSnapshot.evidenceCount,
    policyRules,
    executionMode,
  });
  const resolution =
    result.resolution ??
    ({
      type: result.status === "escalated" ? "escalated" : "unresolved",
      confidence: result.status === "escalated" ? 0.9 : 0.4,
      evidence:
        result.status === "awaiting_approval"
          ? "A tool call is awaiting approval"
          : "The agent run did not complete",
    } as const);
  const agentSettings = await getOrCreateAgentOtherSettings(db, {
    orgId: context.orgId,
    brandId: context.brandId,
  });
  const nextBlockId =
    resolution.type === "escalated" && !agentSettings.allowHandoff
      ? (block.outcomeRouting?.unresolvedNext ?? null)
      : resolveLetKeeniAnswerNext(resolution.type, block.outcomeRouting);

  if (!context.isShadowRun && result.replyText.trim()) {
    await insertMessage(db, {
      orgId: context.orgId,
      conversationId: context.conversationId,
      senderType: "agent",
      plainText: result.replyText,
      content: buildMessageContent(result.replyText),
      isInternal: false,
      sentVia: invocation.sentVia,
      isAgentReply: true,
    });
    await scheduleResolvedConversationAutoClose(db, {
      orgId: context.orgId,
      brandId: context.brandId,
      conversationId: context.conversationId,
      agentRunId: run.id,
      resolutionType: resolution.type,
    });
  }

  return {
    replyText: result.replyText,
    resolution,
    nextBlockId,
    agentRunId: run.id,
    agentRunStatus: result.status,
    approvalId: result.approvalId,
  };
}
