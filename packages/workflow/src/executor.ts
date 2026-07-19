import { resolveApplyRulesMatches } from "./blocks/apply-rules.js";
import { resolveBranchesNext as resolveBranchNext } from "./blocks/branches.js";
import type { WorkflowFacts } from "./blocks/branches.js";
import { resolveLetKeeniAnswerNext } from "./blocks/let-keeni-answer.js";
import type {
  WorkflowActionHandlers,
  WorkflowBlock,
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowRunResult,
  WorkflowStepResult,
  WorkflowSuspendedState,
} from "./schema.js";

function blockById(definition: WorkflowDefinition, id: string): WorkflowBlock | undefined {
  return definition.blocks.find((b) => b.id === id);
}

function defaultNextId(definition: WorkflowDefinition, currentId: string): string | null {
  const index = definition.blocks.findIndex((b) => b.id === currentId);
  if (index < 0 || index >= definition.blocks.length - 1) return null;
  return definition.blocks[index + 1]?.id ?? null;
}

function previewUnknown(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

async function executeBlock(
  block: WorkflowBlock,
  definition: WorkflowDefinition,
  handlers: WorkflowActionHandlers,
  context: WorkflowRunContext | undefined,
  facts: WorkflowFacts,
): Promise<{
  step: WorkflowStepResult;
  nextId: string | null;
  forkTargets?: string[];
  suspended?: WorkflowSuspendedState;
}> {
  let nextId: string | null = defaultNextId(definition, block.id);
  const blockIds = new Set(definition.blocks.map((b) => b.id));

  switch (block.type) {
    case "send_message":
      await handlers.sendMessage({
        plainText: block.plainText,
        attachmentIds: block.attachmentIds,
      });
      return { step: { blockId: block.id, type: block.type, status: "ok" }, nextId };
    case "add_note":
      if (!handlers.addNote) throw new Error("add_note_handler_missing");
      await handlers.addNote({ plainText: block.plainText });
      return { step: { blockId: block.id, type: block.type, status: "ok" }, nextId };
    case "mark_priority":
      if (!handlers.markPriority) throw new Error("mark_priority_handler_missing");
      await handlers.markPriority({ priority: block.priority });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { priority: block.priority },
        },
        nextId,
      };
    case "assign": {
      const input = {
        assigneeId: block.assigneeId ?? null,
        teamId: block.teamId ?? null,
        strategy: block.strategy ?? "direct",
      };
      const result = await handlers.assign(input);
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            assigneeId: result?.assigneeId ?? input.assigneeId,
            teamId: result?.teamId ?? input.teamId,
            assignStrategy: result?.strategy ?? input.strategy,
          },
        },
        nextId,
      };
    }
    case "close":
      await handlers.close();
      return { step: { blockId: block.id, type: block.type, status: "ok" }, nextId };
    case "reopen":
      if (!handlers.reopen) throw new Error("reopen_handler_missing");
      await handlers.reopen();
      return { step: { blockId: block.id, type: block.type, status: "ok" }, nextId };
    case "end":
      return { step: { blockId: block.id, type: block.type, status: "ok" }, nextId: null };
    case "goto":
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { nextBlockId: block.targetBlockId },
        },
        nextId: block.targetBlockId,
      };
    case "show_expected_reply_time": {
      if (!handlers.showExpectedReplyTime) {
        throw new Error("show_expected_reply_time_handler_missing");
      }
      const result = await handlers.showExpectedReplyTime({
        policyId: block.policyId,
        fallbackMinutes: block.fallbackMinutes,
        insideOfficeHoursText: block.insideOfficeHoursText,
        outsideOfficeHoursText: block.outsideOfficeHoursText,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            replyText: result.plainText,
            expectedReplyMinutes: result.expectedReplyMinutes,
            insideOfficeHours: result.insideOfficeHours,
            slaPolicyId: result.policyId,
            policyName: result.policyName,
          },
        },
        nextId,
      };
    }
    case "wait": {
      const ms = block.seconds * 1000;
      if (handlers.wait) await handlers.wait(ms);
      return {
        step: { blockId: block.id, type: block.type, status: "ok", output: { waitMs: ms } },
        nextId,
      };
    }
    case "http_request": {
      if (!handlers.httpRequest) throw new Error("http_request_handler_missing");
      const result = await handlers.httpRequest({
        method: block.method,
        url: block.url,
        body: block.body,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { httpStatus: result.status },
        },
        nextId,
      };
    }
    case "webhook_emit": {
      if (!handlers.webhookEmit) throw new Error("webhook_emit_handler_missing");
      const result = await handlers.webhookEmit({
        blockId: block.id,
        url: block.url,
        eventName: block.eventName,
        payload: block.payload,
        headers: block.headers,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { httpStatus: result.status, webhookEventName: result.eventName },
        },
        nextId,
      };
    }
    case "mcp_call": {
      if (!handlers.mcpCall) throw new Error("mcp_call_handler_missing");
      const result = await handlers.mcpCall({
        serverId: block.serverId,
        toolName: block.toolName,
        arguments: block.arguments,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            mcpServerId: result.serverId,
            mcpToolName: result.toolName,
            mcpResultPreview: previewUnknown(result.result),
          },
        },
        nextId,
      };
    }
    case "branches": {
      nextId = resolveBranchNext(block, facts);
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { nextBlockId: nextId },
        },
        nextId,
      };
    }
    case "apply_rules": {
      const matched = resolveApplyRulesMatches(block, facts, blockIds);
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { matchedBranches: matched },
        },
        nextId,
        forkTargets: matched,
      };
    }
    case "apply_sla": {
      if (!handlers.applySla) throw new Error("apply_sla_handler_missing");
      const result = await handlers.applySla({ policyId: block.policyId });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            slaPolicyId: result.policyId,
            slaBreachCount: result.breachCount,
            slaSkipped: result.skipped,
          },
        },
        nextId,
      };
    }
    case "convert_to_ticket": {
      if (!handlers.convertToTicket) throw new Error("convert_to_ticket_handler_missing");
      const result = await handlers.convertToTicket({ title: block.title });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { ticketId: result.ticketId },
        },
        nextId,
      };
    }
    case "link_ticket": {
      if (!handlers.linkTicket) throw new Error("link_ticket_handler_missing");
      const result = await handlers.linkTicket({
        parentTicketId: block.parentTicketId,
        childTicketId: block.childTicketId,
        linkType: block.linkType,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            parentTicketId: result.parentTicketId,
            childTicketId: result.childTicketId,
          },
        },
        nextId,
      };
    }
    case "send_ticket_form": {
      if (!handlers.sendTicketForm) throw new Error("send_ticket_form_handler_missing");
      if (!context?.workflowRunId) throw new Error("workflow_run_id_required");
      const result = await handlers.sendTicketForm({
        blockId: block.id,
        prompt: block.prompt,
        title: block.title,
        ticketId: block.ticketId,
        fields: block.fields,
        workflowRunId: context.workflowRunId,
        autoCloseMinutes: block.autoCloseMinutes,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { awaitingInput: true, ticketId: result.ticketId },
        },
        nextId: null,
        suspended: { blockId: block.id, type: "send_ticket_form" },
      };
    }
    case "send_ticket_update": {
      if (!handlers.sendTicketUpdate) throw new Error("send_ticket_update_handler_missing");
      const result = await handlers.sendTicketUpdate({ ticketId: block.ticketId });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { notificationSent: result.sent },
        },
        nextId,
      };
    }
    case "set_ticket_state": {
      if (!handlers.setTicketState) throw new Error("set_ticket_state_handler_missing");
      const result = await handlers.setTicketState({
        ticketId: block.ticketId,
        statusId: block.statusId,
        statusName: block.statusName,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            ticketId: result.ticketId,
            statusId: result.statusId,
            statusName: result.statusName,
          },
        },
        nextId,
      };
    }
    case "collect_data": {
      if (!handlers.collectData) throw new Error("collect_data_handler_missing");
      if (!context?.workflowRunId) throw new Error("workflow_run_id_required");
      await handlers.collectData({
        blockId: block.id,
        prompt: block.prompt,
        allowFreeText: block.allowFreeText ?? false,
        fields: block.fields,
        workflowRunId: context.workflowRunId,
        autoCloseMinutes: block.autoCloseMinutes,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { awaitingInput: true },
        },
        nextId: null,
        suspended: { blockId: block.id, type: "collect_data" },
      };
    }
    case "collect_customer_reply": {
      if (!handlers.collectCustomerReply) throw new Error("collect_customer_reply_handler_missing");
      if (!context?.workflowRunId) throw new Error("workflow_run_id_required");
      await handlers.collectCustomerReply({
        blockId: block.id,
        prompt: block.prompt,
        workflowRunId: context.workflowRunId,
        bufferSeconds: block.bufferSeconds ?? 2,
        autoCloseMinutes: block.autoCloseMinutes,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { awaitingInput: true, bufferSeconds: block.bufferSeconds ?? 2 },
        },
        nextId: null,
        suspended: { blockId: block.id, type: "collect_customer_reply" },
      };
    }
    case "reply_buttons": {
      if (!handlers.replyButtons) throw new Error("reply_buttons_handler_missing");
      if (!context?.workflowRunId) throw new Error("workflow_run_id_required");
      await handlers.replyButtons({
        blockId: block.id,
        prompt: block.prompt,
        allowFreeText: block.allowFreeText ?? false,
        buttons: block.buttons,
        workflowRunId: context.workflowRunId,
        autoCloseMinutes: block.autoCloseMinutes,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { awaitingInput: true },
        },
        nextId: null,
        suspended: { blockId: block.id, type: "reply_buttons" },
      };
    }
    case "disable_customer_reply": {
      if (!handlers.disableCustomerReply) {
        throw new Error("disable_customer_reply_handler_missing");
      }
      const result = await handlers.disableCustomerReply({
        disabled: block.disabled,
        reason: block.reason,
      });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { customerReplyDisabled: result.disabled },
        },
        nextId,
      };
    }
    case "snooze": {
      if (!handlers.snooze) throw new Error("snooze_handler_missing");
      await handlers.snooze({ minutes: block.minutes });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { snoozeMinutes: block.minutes },
        },
        nextId,
      };
    }
    case "csat": {
      if (!handlers.csat) throw new Error("csat_handler_missing");
      await handlers.csat({
        blockId: block.id,
        prompt: block.prompt,
        allowComment: block.allowComment ?? true,
        workflowRunId: context?.workflowRunId,
        waitForRating: block.waitForRating ?? false,
        waitForRatingMinutes: block.waitForRatingMinutes,
      });
      if (block.waitForRating) {
        if (!context?.workflowRunId) throw new Error("workflow_run_id_required");
        return {
          step: {
            blockId: block.id,
            type: block.type,
            status: "ok",
            output: { awaitingInput: true },
          },
          nextId: null,
          suspended: { blockId: block.id, type: "csat" },
        };
      }
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { ratingRequested: true },
        },
        nextId,
      };
    }
    case "tag_conversation": {
      if (!handlers.tagConversation) throw new Error("tag_conversation_handler_missing");
      await handlers.tagConversation({ tags: block.tags, mode: block.mode });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: { tags: block.tags, tagMode: block.mode },
        },
        nextId,
      };
    }
    case "tag_end_user": {
      if (!handlers.tagEndUser) throw new Error("tag_end_user_handler_missing");
      const result = await handlers.tagEndUser({ tags: block.tags, mode: block.mode });
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            tags: result.tags,
            tagMode: block.mode,
            targetCustomerId: result.targetCustomerId,
            taggedConversationCount: result.taggedConversationCount,
          },
        },
        nextId,
      };
    }
    case "let_keeni_answer": {
      if (!handlers.letKeeniAnswer) throw new Error("let_keeni_answer_handler_missing");
      if (!context) throw new Error("workflow_context_required");
      const result = await handlers.letKeeniAnswer({
        block,
        context: {
          orgId: context.orgId,
          brandId: context.brandId,
          conversationId: context.conversationId,
          targetCustomerId: context.targetCustomerId,
          subject: context.subject,
          isShadowRun: context.isShadowRun,
        },
      });
      nextId = result.nextBlockId;
      if (!nextId && block.outcomeRouting) {
        nextId = resolveLetKeeniAnswerNext(result.resolution.type, block.outcomeRouting);
      }
      return {
        step: {
          blockId: block.id,
          type: block.type,
          status: "ok",
          output: {
            replyText: result.replyText,
            resolutionType: result.resolution.type,
            nextBlockId: nextId,
          },
        },
        nextId,
      };
    }
    default: {
      const _exhaustive: never = block;
      throw new Error(`unknown_block:${String(_exhaustive)}`);
    }
  }
}

async function runBlockChain(
  startId: string | null,
  definition: WorkflowDefinition,
  handlers: WorkflowActionHandlers,
  context: WorkflowRunContext | undefined,
  facts: WorkflowFacts,
  visited: Set<string>,
  steps: WorkflowStepResult[],
): Promise<WorkflowSuspendedState | undefined> {
  let currentId = startId;

  while (currentId) {
    if (visited.has(currentId)) {
      steps.push({
        blockId: currentId,
        type: "branches",
        status: "error",
        error: "cycle_detected",
      });
      return;
    }
    visited.add(currentId);

    const block = blockById(definition, currentId);
    if (!block) {
      steps.push({
        blockId: currentId,
        type: "send_message",
        status: "error",
        error: "block_not_found",
      });
      return;
    }

    try {
      const { step, nextId, forkTargets, suspended } = await executeBlock(
        block,
        definition,
        handlers,
        context,
        facts,
      );
      steps.push(step);

      if (suspended) return suspended;

      if (forkTargets && forkTargets.length > 0) {
        for (const target of forkTargets) {
          const nested = await runBlockChain(
            target,
            definition,
            handlers,
            context,
            facts,
            visited,
            steps,
          );
          if (nested) return nested;
        }
      }

      currentId = nextId;
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      steps.push({ blockId: block.id, type: block.type, status: "error", error: message });
      return;
    }
  }
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  handlers: WorkflowActionHandlers,
  context?: WorkflowRunContext,
  options?: { startBlockId?: string | null; initialSteps?: WorkflowStepResult[] },
): Promise<WorkflowRunResult> {
  const steps: WorkflowStepResult[] = [...(options?.initialSteps ?? [])];
  const facts = context?.facts ?? {};
  const visited = new Set<string>();
  const startId = options?.startBlockId ?? definition.blocks[0]?.id ?? null;

  const suspended = await runBlockChain(
    startId,
    definition,
    handlers,
    context,
    facts,
    visited,
    steps,
  );

  return suspended ? { steps, suspended } : { steps };
}

export function nextBlockAfter(definition: WorkflowDefinition, blockId: string): string | null {
  return defaultNextId(definition, blockId);
}
