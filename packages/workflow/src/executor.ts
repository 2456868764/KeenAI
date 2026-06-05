import { resolveBranchesNext as resolveBranchNext } from "./blocks/branches.js";
import { resolveLetKeeniAnswerNext } from "./blocks/let-keeni-answer.js";
import type {
  WorkflowActionHandlers,
  WorkflowBlock,
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowRunResult,
  WorkflowStepResult,
} from "./schema.js";

function blockById(definition: WorkflowDefinition, id: string): WorkflowBlock | undefined {
  return definition.blocks.find((b) => b.id === id);
}

function defaultNextId(definition: WorkflowDefinition, currentId: string): string | null {
  const index = definition.blocks.findIndex((b) => b.id === currentId);
  if (index < 0 || index >= definition.blocks.length - 1) return null;
  return definition.blocks[index + 1]?.id ?? null;
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  handlers: WorkflowActionHandlers,
  context?: WorkflowRunContext,
): Promise<WorkflowRunResult> {
  const steps: WorkflowStepResult[] = [];
  const facts = context?.facts ?? {};
  let currentId: string | null = definition.blocks[0]?.id ?? null;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      steps.push({
        blockId: currentId,
        type: "branches",
        status: "error",
        error: "cycle_detected",
      });
      break;
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
      break;
    }

    let nextId: string | null = defaultNextId(definition, currentId);

    try {
      switch (block.type) {
        case "send_message":
          await handlers.sendMessage({
            plainText: block.plainText,
            attachmentIds: block.attachmentIds,
          });
          steps.push({ blockId: block.id, type: block.type, status: "ok" });
          break;
        case "assign":
          await handlers.assign(block.assigneeId ?? null);
          steps.push({ blockId: block.id, type: block.type, status: "ok" });
          break;
        case "close":
          await handlers.close();
          steps.push({ blockId: block.id, type: block.type, status: "ok" });
          break;
        case "wait": {
          const ms = block.seconds * 1000;
          if (handlers.wait) {
            await handlers.wait(ms);
          }
          steps.push({ blockId: block.id, type: block.type, status: "ok", output: { waitMs: ms } });
          break;
        }
        case "http_request": {
          if (!handlers.httpRequest) {
            throw new Error("http_request_handler_missing");
          }
          const result = await handlers.httpRequest({
            method: block.method,
            url: block.url,
            body: block.body,
          });
          steps.push({
            blockId: block.id,
            type: block.type,
            status: "ok",
            output: { httpStatus: result.status },
          });
          break;
        }
        case "branches": {
          nextId = resolveBranchNext(block, facts);
          steps.push({
            blockId: block.id,
            type: block.type,
            status: "ok",
            output: { nextBlockId: nextId },
          });
          break;
        }
        case "convert_to_ticket": {
          if (!handlers.convertToTicket) {
            throw new Error("convert_to_ticket_handler_missing");
          }
          const result = await handlers.convertToTicket({ title: block.title });
          steps.push({
            blockId: block.id,
            type: block.type,
            status: "ok",
            output: { ticketId: result.ticketId },
          });
          break;
        }
        case "let_keeni_answer": {
          if (!handlers.letKeeniAnswer) {
            throw new Error("let_keeni_answer_handler_missing");
          }
          if (!context) {
            throw new Error("workflow_context_required");
          }
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
          steps.push({
            blockId: block.id,
            type: block.type,
            status: "ok",
            output: {
              replyText: result.replyText,
              resolutionType: result.resolution.type,
              nextBlockId: nextId,
            },
          });
          break;
        }
        default: {
          const _exhaustive: never = block;
          throw new Error(`unknown_block:${String(_exhaustive)}`);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      steps.push({ blockId: block.id, type: block.type, status: "error", error: message });
      break;
    }

    currentId = nextId;
  }

  return { steps };
}
