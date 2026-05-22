import type {
  WorkflowActionHandlers,
  WorkflowDefinition,
  WorkflowRunResult,
  WorkflowStepResult,
} from "./schema.js";

export async function runWorkflow(
  definition: WorkflowDefinition,
  handlers: WorkflowActionHandlers,
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
          break;
        case "assign":
          await handlers.assign(block.assigneeId ?? null);
          break;
        case "close":
          await handlers.close();
          break;
        default: {
          const _exhaustive: never = block;
          throw new Error(`unknown_block:${String(_exhaustive)}`);
        }
      }
      steps.push({ blockId: block.id, type: block.type, status: "ok" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      steps.push({ blockId: block.id, type: block.type, status: "error", error: message });
      break;
    }
  }

  return { steps };
}
