import type {
  WorkflowActionHandlers,
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowRunResult,
  WorkflowStepResult,
} from "./schema.js";

export async function runWorkflow(
  definition: WorkflowDefinition,
  handlers: WorkflowActionHandlers,
  context?: WorkflowRunContext,
): Promise<WorkflowRunResult> {
  const steps: WorkflowStepResult[] = [];

  for (const block of definition.blocks) {
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
          steps.push({
            blockId: block.id,
            type: block.type,
            status: "ok",
            output: {
              replyText: result.replyText,
              resolutionType: result.resolution.type,
              nextBlockId: result.nextBlockId,
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
  }

  return { steps };
}
