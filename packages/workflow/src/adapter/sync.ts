import type { WorkflowDispatchAdapter, WorkflowDispatchHandlers } from "./types.js";

export function createSyncWorkflowDispatch(
  handlers: WorkflowDispatchHandlers,
): WorkflowDispatchAdapter {
  return {
    mode: "sync",
    dispatchFirstMessage: handlers.dispatchFirstMessage,
    dispatchConversationTrigger: handlers.dispatchConversationTrigger,
    dispatchTicketTrigger: handlers.dispatchTicketTrigger,
    scanCustomerUnresponsive: handlers.scanCustomerUnresponsive,
  };
}
