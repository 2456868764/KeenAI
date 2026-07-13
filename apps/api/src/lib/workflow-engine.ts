import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import {
  conversations,
  ticketConversations,
  tickets,
  workflowRuns,
  type workflowVersions,
  workflows,
} from "@keenai/storage/schema";
import {
  WORKFLOW_INNGEST_EVENTS,
  type WorkflowConversationTrigger,
  type WorkflowDefinition,
  type WorkflowRunContext,
  type WorkflowTicketTrigger,
  runWorkflow,
} from "@keenai/workflow";
import { and, desc, eq } from "drizzle-orm";
import {
  createWorkflowActionHandlers,
  createWorkflowRunContext,
  resolveActiveWorkflowDefinition,
} from "./workflow-handlers.js";
import {
  autoCloseMsForBlock,
  emitWorkflowAwaitingInput,
  resolveRunStatus,
} from "./workflow-resume.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

function pageUrlMatches(rule: NonNullable<WorkflowDefinition["pageRules"]>[number], url: string) {
  if (rule.urlOp === "eq") return url === rule.url;
  if (rule.urlOp === "contains") return url.includes(rule.url);
  try {
    return new RegExp(rule.url).test(url);
  } catch {
    return false;
  }
}

function workflowMatchesPageView(
  definition: WorkflowDefinition,
  facts?: WorkflowRunContext["facts"],
) {
  const rules = definition.pageRules ?? [];
  if (rules.length === 0) return true;
  const pageUrl = facts?.pageUrl;
  if (!pageUrl) return false;
  const timeOnPageSec = facts?.timeOnPageSec ?? 0;
  return rules.some((rule) => {
    if (!pageUrlMatches(rule, pageUrl)) return false;
    return rule.timeOnPageSec === undefined || timeOnPageSec >= rule.timeOnPageSec;
  });
}

function workflowMatchesEvent(definition: WorkflowDefinition, facts?: WorkflowRunContext["facts"]) {
  const expected = definition.eventName?.trim();
  if (!expected) return false;
  return facts?.eventName === expected;
}

export async function executeWorkflow(
  db: Db,
  workflow: typeof workflows.$inferSelect,
  conversationId: string,
  env: ApiEnv,
  authConfig?: AuthConfig,
  options?: { facts?: WorkflowRunContext["facts"] },
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
  const baseContext = createWorkflowRunContext(workflow, conversation, run.id);
  const context: WorkflowRunContext = {
    ...baseContext,
    facts: { ...baseContext.facts, ...options?.facts },
  };

  const result = await runWorkflow(definition, handlers, context);
  const status = resolveRunStatus(result.steps, Boolean(result.suspended));

  const [updated] = await db
    .update(workflowRuns)
    .set({ status, steps: result.steps })
    .where(eq(workflowRuns.id, run.id))
    .returning();

  if (result.suspended) {
    const block = definition.blocks.find((item) => item.id === result.suspended?.blockId);
    if (result.suspended.type === "csat" && block?.type === "csat" && block.waitForRatingMinutes) {
      const { emitCsatRequest } = await import("./workflow-resume.js");
      await emitCsatRequest({
        workflowRunId: run.id,
        conversationId,
        orgId: workflow.orgId,
        brandId: conversation.brandId,
        stepId: block.id,
        waitForRating: true,
        waitForRatingMs: block.waitForRatingMinutes * 60_000,
      });
    } else {
      const autoCloseMs = autoCloseMsForBlock(definition, result.suspended.blockId);
      if (autoCloseMs > 0) {
        await emitWorkflowAwaitingInput({
          workflowRunId: run.id,
          conversationId,
          orgId: workflow.orgId,
          brandId: conversation.brandId,
          autoCloseMs,
          blockId: result.suspended.blockId,
          awaitEvent:
            result.suspended.type === "collect_data"
              ? WORKFLOW_INNGEST_EVENTS.ATTRIBUTE_SUBMITTED
              : WORKFLOW_INNGEST_EVENTS.BUTTON_CLICKED,
        });
      }
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
  return dispatchConversationTriggerWorkflows(
    db,
    { ...input, trigger: "first_message" },
    env,
    authConfig,
  );
}

export async function dispatchConversationTriggerWorkflows(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    conversationId: string;
    trigger: WorkflowConversationTrigger | WorkflowTicketTrigger | "first_message";
    facts?: WorkflowRunContext["facts"];
  },
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
        eq(workflows.trigger, input.trigger),
      ),
    )
    .orderBy(desc(workflows.updatedAt));

  const runs = [];
  for (const workflow of rows) {
    if (workflow.brandId && workflow.brandId !== input.brandId) continue;
    const definition = resolveActiveWorkflowDefinition(workflow);
    if (input.trigger === "page_view" && !workflowMatchesPageView(definition, input.facts)) {
      continue;
    }
    if (input.trigger === "event_match" && !workflowMatchesEvent(definition, input.facts)) {
      continue;
    }
    const run = await executeWorkflow(db, workflow, input.conversationId, env, authConfig, {
      facts: input.facts,
    });
    if (run) runs.push(run);
  }
  return runs;
}

export async function dispatchTicketTriggerWorkflows(
  db: Db,
  input: {
    orgId: string;
    ticketId: string;
    trigger: WorkflowTicketTrigger;
    facts?: WorkflowRunContext["facts"];
  },
  env: ApiEnv,
  authConfig?: AuthConfig,
) {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, input.orgId)))
    .limit(1);
  if (!ticket) return [];

  const [link] = await db
    .select({ conversationId: ticketConversations.conversationId })
    .from(ticketConversations)
    .where(eq(ticketConversations.ticketId, input.ticketId))
    .limit(1);
  if (!link) return [];

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, link.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);
  if (!conversation) return [];

  return dispatchConversationTriggerWorkflows(
    db,
    {
      orgId: input.orgId,
      brandId: conversation.brandId,
      conversationId: conversation.id,
      trigger: input.trigger,
      facts: {
        channelType: conversation.channelType,
        priority: ticket.priority ?? conversation.priority ?? "normal",
        conversationStatus: conversation.status,
        ...input.facts,
      },
    },
    env,
    authConfig,
  );
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

export function serializeWorkflowVersion(row: typeof workflowVersions.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    workflowId: row.workflowId,
    version: row.version,
    snapshot: row.snapshot,
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
