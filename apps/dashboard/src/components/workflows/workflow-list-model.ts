import type { WorkflowDefinition } from "../../lib/api";

export function createScratchWorkflowDefinition(
  trigger: WorkflowDefinition["trigger"] = "page_view",
): WorkflowDefinition {
  const definition: WorkflowDefinition = {
    trigger,
    blocks: [
      {
        id: "welcome",
        type: "send_message",
        plainText: "Hello! How can I help you today?",
      },
      {
        id: "buttons",
        type: "reply_buttons",
        prompt: "Choose an option",
        allowFreeText: true,
        buttons: [
          { id: "login", label: "I can't log in", nextId: null },
          { id: "bug", label: "I found a bug", nextId: null },
        ],
      },
    ],
  };

  if (trigger === "page_view") {
    return {
      ...definition,
      pageRules: [{ urlOp: "contains", url: "/", timeOnPageSec: 0 }],
      audience: { match: "all", rules: [] },
    };
  }

  if (trigger === "customer_unresponsive" || trigger === "teammate_unresponsive") {
    return {
      ...definition,
      inactivityMinutes: 60,
    };
  }

  if (trigger === "schedule") {
    return {
      ...definition,
      cron: "0 9 * * 1",
      audience: { match: "all", rules: [] },
    };
  }

  if (trigger === "event_match") {
    return {
      ...definition,
      eventName: "app/event.created",
    };
  }

  return definition;
}
