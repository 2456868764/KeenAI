import type { WorkflowDispatchAdapter, WorkflowDispatchHandlers } from "./types.js";

export function createSyncWorkflowDispatch(
  handlers: WorkflowDispatchHandlers,
): WorkflowDispatchAdapter {
  return {
    mode: "sync",
    dispatchFirstMessage: handlers.dispatchFirstMessage,
    scanCustomerUnresponsive: handlers.scanCustomerUnresponsive,
  };
}
