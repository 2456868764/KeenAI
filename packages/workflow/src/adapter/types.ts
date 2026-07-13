import type { WorkflowRunContext } from "../schema.js";

export type WorkflowDispatchContext = {
  orgId: string;
  brandId: string;
  conversationId: string;
};

export type WorkflowConversationTrigger =
  | "new_messenger_conversation"
  | "any_message"
  | "teammate_message"
  | "teammate_added_note"
  | "conversation_state_changed"
  | "assigned_to_team"
  | "assigned_to_member";

export type WorkflowTicketTrigger = "ticket_created" | "ticket_state_changed";

export type WorkflowConversationTriggerContext = WorkflowDispatchContext & {
  trigger: WorkflowConversationTrigger;
  facts?: WorkflowRunContext["facts"];
};

export type WorkflowTicketTriggerContext = {
  orgId: string;
  ticketId: string;
  trigger: WorkflowTicketTrigger;
  facts?: WorkflowRunContext["facts"];
};

export type UnresponsiveScanSummary = {
  mode: "sync" | "inngest";
  scanned?: number;
  triggered: number;
  runs?: string[];
  queued?: boolean;
};

export type WorkflowDispatchHandlers = {
  dispatchFirstMessage(ctx: WorkflowDispatchContext): Promise<void>;
  dispatchConversationTrigger(ctx: WorkflowConversationTriggerContext): Promise<void>;
  dispatchTicketTrigger(ctx: WorkflowTicketTriggerContext): Promise<void>;
  scanCustomerUnresponsive(orgId?: string): Promise<Omit<UnresponsiveScanSummary, "mode">>;
};

export type WorkflowDispatchAdapter = WorkflowDispatchHandlers & {
  readonly mode: "sync" | "inngest";
};
