export const WORKFLOW_INNGEST_EVENTS = {
  FIRST_MESSAGE: "keenai/workflow.first_message",
  SCAN_UNRESPONSIVE: "keenai/workflow.scan_unresponsive",
} as const;

export type InngestSendFn = (payload: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<void>;

export function createInngestWorkflowDispatch(
  send: InngestSendFn,
  _handlers: import("./types.js").WorkflowDispatchHandlers,
): import("./types.js").WorkflowDispatchAdapter {
  return {
    mode: "inngest",
    dispatchFirstMessage: async (ctx) => {
      await send({ name: WORKFLOW_INNGEST_EVENTS.FIRST_MESSAGE, data: ctx });
    },
    scanCustomerUnresponsive: async (orgId) => {
      await send({
        name: WORKFLOW_INNGEST_EVENTS.SCAN_UNRESPONSIVE,
        data: orgId ? { orgId } : {},
      });
      return { triggered: 0, queued: true };
    },
  };
}
