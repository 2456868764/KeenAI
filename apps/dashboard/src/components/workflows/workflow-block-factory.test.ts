import { describe, expect, it } from "vitest";
import { createWorkflowBlock } from "./workflow-block-factory";

describe("createWorkflowBlock", () => {
  it("creates unique ids for rapid canvas inserts", () => {
    const first = createWorkflowBlock("send_message");
    const second = createWorkflowBlock("send_message");

    expect(first.id).toMatch(/^block-/);
    expect(second.id).toMatch(/^block-/);
    expect(second.id).not.toBe(first.id);
  });

  it("creates link-ticket blocks with required editable canvas defaults", () => {
    const block = createWorkflowBlock("link_ticket");

    expect(block).toMatchObject({
      type: "link_ticket",
      childTicketId: "ticket-id",
      linkType: "tracks",
    });
  });
});
