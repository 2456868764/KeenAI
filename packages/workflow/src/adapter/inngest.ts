export const WORKFLOW_INNGEST_EVENTS = {
  FIRST_MESSAGE: "keenai/workflow.first_message",
  CONVERSATION_TRIGGER: "keenai/workflow.conversation_trigger",
  TICKET_TRIGGER: "keenai/workflow.ticket_trigger",
  SCAN_UNRESPONSIVE: "keenai/workflow.scan_unresponsive",
  STEP_AWAITING_INPUT: "keenai/workflow.step_awaiting_input",
  CSAT_REQUEST: "keenai/workflow.csat_request",
  ATTRIBUTE_SUBMITTED: "widget/attribute.submitted",
  TICKET_FORM_SUBMITTED: "widget/ticket_form.submitted",
  BUTTON_CLICKED: "widget/button.clicked",
  CSAT_RATED: "widget/csat.rated",
  CUSTOMER_REPLY_RECEIVED: "conversation/message.received",
  CONVERSATION_CLOSED: "conversation/state.changed.closed",
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
    dispatchConversationTrigger: async (ctx) => {
      await send({ name: WORKFLOW_INNGEST_EVENTS.CONVERSATION_TRIGGER, data: ctx });
    },
    dispatchTicketTrigger: async (ctx) => {
      await send({ name: WORKFLOW_INNGEST_EVENTS.TICKET_TRIGGER, data: ctx });
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
