import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, workflowRuns, workflows } from "@keenai/storage/schema";
import { type WorkflowDefinition, runWorkflow } from "@keenai/workflow";
import { and, desc, eq } from "drizzle-orm";
import { buildMessageContent, insertMessage } from "./conversations.js";
import { buildEmailSendJob, dispatchEmailOutbound } from "./email-outbound.js";
import { getKbDispatch } from "./kb-dispatch-init.js";
import { dispatchKbConversationClosed } from "./kb-dispatch.js";
import { notifyTicketStatusChange } from "./ticket-notify.js";
import {
  createTicketFromConversation,
  getConversationTicketId,
  getTicketForOrg,
  linkTickets,
  loadTicketMeta,
} from "./tickets.js";
import { runLetKeeniAnswerBlock } from "./workflow-keeni-answer.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export function resolveActiveWorkflowDefinition(
  workflow: typeof workflows.$inferSelect,
): WorkflowDefinition {
  if (workflow.status === "published" && workflow.publishedDefinition) {
    return workflow.publishedDefinition as WorkflowDefinition;
  }
  return workflow.definition as WorkflowDefinition;
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
  const result = await runWorkflow(
    definition,
    {
      sendMessage: async ({ plainText, attachmentIds }) => {
        const { message } = await insertMessage(db, {
          orgId: workflow.orgId,
          conversationId,
          senderType: "agent",
          plainText,
          attachmentIds,
          content: plainText ? buildMessageContent(plainText) : undefined,
          isInternal: false,
          sentVia: "workflow",
          isAgentReply: true,
        });

        if (plainText && authConfig) {
          const job = await buildEmailSendJob(db, {
            orgId: workflow.orgId,
            conversationId,
            plainText,
            messageId: message.id,
          });
          if (job) {
            await dispatchEmailOutbound(db, env, authConfig, job);
          }
        }
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
        try {
          await dispatchKbConversationClosed(getKbDispatch(), db, {
            orgId: workflow.orgId,
            brandId: conversation.brandId,
            conversationId,
          });
        } catch {
          // KB crystallize is best-effort on close
        }
      },
      letKeeniAnswer: (input) => runLetKeeniAnswerBlock(db, env, input),
      convertToTicket: async ({ title }) => {
        const ticket = await createTicketFromConversation(db, {
          orgId: workflow.orgId,
          conversationId,
          title,
        });
        return { ticketId: ticket.id };
      },
      linkTicket: async ({ parentTicketId, childTicketId, linkType }) => {
        let parentId = parentTicketId;
        if (!parentId) {
          parentId =
            (await getConversationTicketId(db, workflow.orgId, conversationId)) ?? undefined;
          if (!parentId) throw new Error("conversation_ticket_missing");
        }
        const linked = await linkTickets(db, {
          orgId: workflow.orgId,
          parentId,
          childId: childTicketId,
          linkType,
        });
        if (!linked) throw new Error("link_failed");
        return { parentTicketId: parentId, childTicketId };
      },
      sendTicketUpdate: async ({ ticketId }) => {
        const resolvedId =
          ticketId ?? (await getConversationTicketId(db, workflow.orgId, conversationId));
        if (!resolvedId) throw new Error("ticket_not_found");
        const row = await getTicketForOrg(db, resolvedId, workflow.orgId);
        if (!row) throw new Error("ticket_not_found");
        const ticket = await loadTicketMeta(db, row);
        if (!ticket.statusName) throw new Error("ticket_status_missing");
        if (!authConfig) return { sent: false };
        const result = await notifyTicketStatusChange(db, authConfig, {
          orgId: workflow.orgId,
          ticket,
          statusName: ticket.statusName,
        });
        return { sent: result.sent };
      },
      wait: async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      },
      httpRequest: async ({ method, url, body }) => {
        const res = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ?? undefined,
          signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        return { status: res.status, body: text.slice(0, 4000) };
      },
    },
    {
      workflowId: workflow.id,
      orgId: workflow.orgId,
      brandId: conversation.brandId,
      conversationId,
      targetCustomerId: conversation.userId,
      subject: conversation.subject ?? undefined,
      facts: {
        channelType: conversation.channelType,
        priority: conversation.priority ?? "normal",
        conversationStatus: conversation.status,
      },
    },
  );

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
