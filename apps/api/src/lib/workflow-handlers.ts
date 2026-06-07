import type { AuthConfig } from "@keenai/auth";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import { conversations, type workflows } from "@keenai/storage/schema";
import type {
  CollectDataInput,
  WorkflowActionHandlers,
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowStepResult,
} from "@keenai/workflow";
import { eq } from "drizzle-orm";
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
type ConversationRow = typeof conversations.$inferSelect;
type WorkflowRow = typeof workflows.$inferSelect;

export function buildCollectDataMessageContent(input: CollectDataInput): Record<string, unknown> {
  return {
    type: "workflow_collect_data",
    text: input.prompt,
    workflow: {
      kind: "collect_data",
      workflowRunId: input.workflowRunId,
      blockId: input.blockId,
      fields: input.fields,
      allowFreeText: input.allowFreeText,
    },
  };
}

export function createWorkflowActionHandlers(
  db: Db,
  workflow: WorkflowRow,
  conversation: ConversationRow,
  env: ApiEnv,
  authConfig: AuthConfig | undefined,
  workflowRunId: string,
): WorkflowActionHandlers {
  const conversationId = conversation.id;

  return {
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
        parentId = (await getConversationTicketId(db, workflow.orgId, conversationId)) ?? undefined;
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
    collectData: async (input) => {
      await insertMessage(db, {
        orgId: workflow.orgId,
        conversationId,
        senderType: "agent",
        plainText: input.prompt,
        content: buildCollectDataMessageContent({ ...input, workflowRunId }),
        isInternal: false,
        sentVia: "workflow",
        isAgentReply: true,
      });
    },
  };
}

export function createWorkflowRunContext(
  workflow: WorkflowRow,
  conversation: ConversationRow,
  workflowRunId: string,
): WorkflowRunContext {
  return {
    workflowId: workflow.id,
    workflowRunId,
    orgId: workflow.orgId,
    brandId: conversation.brandId,
    conversationId: conversation.id,
    targetCustomerId: conversation.userId,
    subject: conversation.subject ?? undefined,
    facts: {
      channelType: conversation.channelType,
      priority: conversation.priority ?? "normal",
      conversationStatus: conversation.status,
    },
  };
}

export function patchCollectDataStep(
  steps: WorkflowStepResult[],
  blockId: string,
  submission: { attributes: Record<string, string>; freeText?: string },
): WorkflowStepResult[] {
  return steps.map((step) => {
    if (step.blockId !== blockId || step.type !== "collect_data") return step;
    return {
      ...step,
      output: {
        ...step.output,
        awaitingInput: false,
        submittedAttributes: submission.attributes,
        freeText: submission.freeText,
      },
    };
  });
}

export function resolveActiveWorkflowDefinition(workflow: WorkflowRow): WorkflowDefinition {
  if (workflow.status === "published" && workflow.publishedDefinition) {
    return workflow.publishedDefinition as WorkflowDefinition;
  }
  return workflow.definition as WorkflowDefinition;
}
