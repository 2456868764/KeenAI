import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, messages, workflowRuns, workflows } from "@keenai/storage/schema";
import { type WorkflowDefinition, resolveInactivityMs } from "@keenai/workflow";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { executeWorkflow } from "./workflow-engine.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export type UnresponsiveScanResult = {
  scanned: number;
  triggered: number;
  runs: string[];
};

async function lastPublicMessage(db: Db, conversationId: string) {
  const [row] = await db
    .select({
      id: messages.id,
      senderType: messages.senderType,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.isInternal, false)))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row ?? null;
}

async function hasRunSince(
  db: Db,
  workflowId: string,
  conversationId: string,
  since: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.conversationId, conversationId),
        gt(workflowRuns.createdAt, since),
      ),
    )
    .limit(1);
  return !!row;
}

export async function scanCustomerUnresponsiveWorkflows(
  db: Db,
  opts: { env: ApiEnv; now?: Date; orgId?: string },
): Promise<UnresponsiveScanResult> {
  const now = opts?.now ?? new Date();
  const wfFilters = [
    eq(workflows.status, "published"),
    eq(workflows.trigger, "customer_unresponsive"),
  ];
  if (opts?.orgId) wfFilters.push(eq(workflows.orgId, opts.orgId));

  const published = await db
    .select()
    .from(workflows)
    .where(and(...wfFilters));

  if (published.length === 0) {
    return { scanned: 0, triggered: 0, runs: [] };
  }

  const orgIds = [...new Set(published.map((w) => w.orgId))];
  const openConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        inArray(conversations.orgId, orgIds),
        eq(conversations.status, "open"),
        or(isNull(conversations.snoozedUntil), gt(conversations.snoozedUntil, now)),
      ),
    );

  const runs: string[] = [];
  let triggered = 0;

  for (const conversation of openConversations) {
    const last = await lastPublicMessage(db, conversation.id);
    if (!last || last.senderType !== "agent") continue;

    const matching = published.filter(
      (wf) =>
        wf.orgId === conversation.orgId && (!wf.brandId || wf.brandId === conversation.brandId),
    );

    for (const workflow of matching) {
      const definition = workflow.definition as WorkflowDefinition;
      const inactivityMs = resolveInactivityMs(definition);
      const elapsed = now.getTime() - last.createdAt.getTime();
      if (elapsed < inactivityMs) continue;

      const alreadyRan = await hasRunSince(db, workflow.id, conversation.id, last.createdAt);
      if (alreadyRan) continue;

      const run = await executeWorkflow(db, workflow, conversation.id, opts.env);
      if (run) {
        runs.push(run.id);
        triggered += 1;
      }
    }
  }

  return { scanned: openConversations.length, triggered, runs };
}
