import { describe, expect, it } from "vitest";
import { workflowGroupNotice } from "./workflow-list-meta";
import { createScratchWorkflowDefinition } from "./workflow-list-model";

describe("workflowGroupNotice", () => {
  it("shows the AI Agent deployment notice for Messenger workflow groups", () => {
    expect(workflowGroupNotice("messenger")).toEqual({
      text: "Basic AI Agent deployment is enabled, AI Agent will take priority over any customer-facing workflows that match",
      href: "/settings/channels",
      linkLabel: "Manage agent deployment",
    });
  });

  it("does not show the deployment notice for unrelated groups", () => {
    expect(workflowGroupNotice("page_view")).toBeUndefined();
    expect(workflowGroupNotice("schedule")).toBeUndefined();
  });
});

describe("createScratchWorkflowDefinition", () => {
  it("creates page visit defaults for the global scratch action", () => {
    const definition = createScratchWorkflowDefinition();

    expect(definition.trigger).toBe("page_view");
    expect(definition.pageRules).toEqual([{ urlOp: "contains", url: "/", timeOnPageSec: 0 }]);
    expect(definition.audience).toEqual({ match: "all", rules: [] });
  });

  it("creates trigger-specific scratch definitions for workflow groups", () => {
    const firstMessage = createScratchWorkflowDefinition("first_message");
    expect(firstMessage.trigger).toBe("first_message");
    expect(firstMessage.pageRules).toBeUndefined();
    expect(firstMessage.cron).toBeUndefined();

    expect(createScratchWorkflowDefinition("schedule")).toMatchObject({
      trigger: "schedule",
      cron: "0 9 * * 1",
    });
    expect(createScratchWorkflowDefinition("event_match")).toMatchObject({
      trigger: "event_match",
      eventName: "app/event.created",
    });
    expect(createScratchWorkflowDefinition("customer_unresponsive")).toMatchObject({
      trigger: "customer_unresponsive",
      inactivityMinutes: 60,
    });
  });
});
