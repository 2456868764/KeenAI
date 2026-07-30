import type { WorkflowBlock } from "../../lib/api";

export type WorkflowBlockType = WorkflowBlock["type"];

let workflowBlockIdCounter = 0;

function newWorkflowBlockId() {
  workflowBlockIdCounter += 1;
  return `block-${Date.now().toString(36)}-${workflowBlockIdCounter.toString(36)}`;
}

export function createWorkflowBlock(type: WorkflowBlockType): WorkflowBlock {
  const id = newWorkflowBlockId();
  switch (type) {
    case "send_message":
      return { id, type, plainText: "Hello!" };
    case "show_expected_reply_time":
      return { id, type, fallbackMinutes: 240 };
    case "add_note":
      return { id, type, plainText: "Internal note" };
    case "mark_priority":
      return { id, type, priority: "high" };
    case "assign":
      return { id, type, assigneeId: null, teamId: null, strategy: "direct" };
    case "close":
    case "reopen":
    case "end":
      return { id, type };
    case "goto":
      return { id, type, targetBlockId: "" };
    case "let_keeni_answer":
      return { id, type, maxSteps: 8, instructions: "" };
    case "wait":
      return { id, type, seconds: 60 };
    case "http_request":
      return { id, type, method: "GET", url: "https://example.com/hook" };
    case "webhook_emit":
      return {
        id,
        type,
        url: "https://example.com/webhook",
        eventName: "workflow.event",
        payload: "{}",
      };
    case "mcp_call":
      return {
        id,
        type,
        serverId: "stub",
        toolName: "echo",
        arguments: { message: "hello" },
      };
    case "script":
      return {
        id,
        type,
        code: 'return { channel: facts.channelType, priority: facts.priority ?? "normal" };',
        timeoutMs: 2000,
        memoryMb: 32,
      };
    case "branches":
      return {
        id,
        type,
        branches: [
          {
            label: "Email channel",
            condition: { field: "channelType", op: "eq", value: "email" },
            nextId: null,
          },
          { label: "Default", nextId: null },
        ],
      };
    case "apply_rules":
      return {
        id,
        type,
        rules: [
          {
            label: "Messenger",
            condition: { field: "channelType", op: "eq", value: "messenger" },
            nextId: `next-${id}`,
          },
        ],
      };
    case "apply_sla":
      return { id, type };
    case "convert_to_ticket":
      return { id, type, title: "" };
    case "link_ticket":
      return { id, type, childTicketId: "ticket-id", linkType: "tracks" };
    case "send_ticket_update":
      return { id, type };
    case "send_ticket_form":
      return {
        id,
        type,
        prompt: "Please share the details we need for this ticket.",
        fields: [{ key: "impact", label: "Impact", type: "text", required: true }],
      };
    case "collect_data":
      return {
        id,
        type,
        prompt: "What is your email?",
        allowFreeText: false,
        fields: [{ key: "email", label: "Email", required: true }],
      };
    case "collect_customer_reply":
      return {
        id,
        type,
        prompt: "Reply here when you are ready.",
        bufferSeconds: 2,
      };
    case "reply_buttons":
      return {
        id,
        type,
        prompt: "How can we help?",
        allowFreeText: false,
        buttons: [
          { id: "sales", label: "Sales", nextId: null },
          { id: "support", label: "Support", nextId: null },
        ],
      };
    case "disable_customer_reply":
      return { id, type, disabled: true };
    case "snooze":
      return { id, type, minutes: 60 };
    case "tag_end_user":
      return { id, type, tags: ["vip"], mode: "append" };
    case "tag_conversation":
      return { id, type, tags: ["vip"], mode: "append" };
    case "set_ticket_state":
      return { id, type, statusName: "Done" };
    case "csat":
      return {
        id,
        type,
        prompt: "How would you rate this conversation?",
        allowComment: true,
        waitForRating: false,
      };
  }
}
