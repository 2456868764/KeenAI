import { createInngestWorkflowDispatch } from "./inngest.js";
import { createSyncWorkflowDispatch } from "./sync.js";
import type { WorkflowDispatchAdapter, WorkflowDispatchHandlers } from "./types.js";

export type WorkflowDispatchConfig = {
  inngestEventKey?: string;
  handlers: WorkflowDispatchHandlers;
  send?: (payload: { name: string; data: Record<string, unknown> }) => Promise<void>;
};

export function createWorkflowDispatch(config: WorkflowDispatchConfig): WorkflowDispatchAdapter {
  if (config.inngestEventKey && config.send) {
    return createInngestWorkflowDispatch(config.send, config.handlers);
  }
  return createSyncWorkflowDispatch(config.handlers);
}

export type {
  WorkflowDispatchAdapter,
  WorkflowDispatchContext,
  WorkflowDispatchHandlers,
  UnresponsiveScanSummary,
} from "./types.js";
export { createSyncWorkflowDispatch } from "./sync.js";
export { createInngestWorkflowDispatch, WORKFLOW_INNGEST_EVENTS } from "./inngest.js";
