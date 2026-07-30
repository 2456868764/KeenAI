import { describe, expect, it } from "vitest";
import { workflowGroupNotice } from "./workflow-list-meta";

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
