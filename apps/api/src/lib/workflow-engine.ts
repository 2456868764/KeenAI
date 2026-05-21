import type { createLibsqlStore } from "@keenai/storage";
import { conversations, workflowRuns, workflows } from "@keenai/storage/schema";
import { type WorkflowDefinition, runWorkflow } from "@keenai/workflow";
import { and, desc, eq } from "drizzle-orm";
import { buildMessageContent, insertMessage } from "./conversations.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export async function executeWorkflow(
  db: Db,
  workflow: typeof workflows.$inferSelect,
  conversationId: string,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, workflow.orgId)))
    .limit(1);

  if (!conversation) return null;

  const definition = workflow.definition as WorkflowDefinition;
  const result = await runWorkflow(definition, {
    sendMessage: async (plainText) => {
      await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        senderId: null,
        plainText,
        content: buildMessageContent(plainText),
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
      });
    },
    assign: async (assigneeId) => {
      await db
        .update(conversations)
        .set({ assigneeId, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    },
    close: async () => {
      await db
        .update(conversations)
        .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    },
  });

  const failed = result.steps.some((s) => s.status === "error");
  const [run] = await db
    .insert(workflowRuns)
    .values({
      orgId: workflow.orgId,
      workflowId: workflow.id,
      conversationId,
      status: failed ? "failed" : "completed",
      steps: result.steps,
    })
    .returning();

  return run ?? null;
}

export async function dispatchFirstMessageWorkflows(
  db: Db,
  input: { orgId: string; brandId: string; conversationId: string },
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
    const run = await executeWorkflow(db, workflow, input.conversationId);
    if (run) runs.push(run);
  }
  return runs;
}

export function serializeWorkflow(row: typeof workflows.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    name: row.name,
    trigger: row.trigger,
    definition: row.definition,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
