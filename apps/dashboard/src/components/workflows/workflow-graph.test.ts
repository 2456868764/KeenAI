import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../../lib/api";
import {
  blockCategory,
  blockLabel,
  collectWorkflowEdges,
  highlightBlocksFromRunSteps,
} from "./workflow-graph";

const base: WorkflowDefinition = {
  trigger: "first_message",
  blocks: [
    { id: "a", type: "send_message", plainText: "Hi" },
    {
      id: "b",
      type: "branches",
      branches: [
        {
          label: "Email",
          condition: { field: "channelType", op: "eq", value: "email" },
          nextId: "c",
        },
        { label: "Default", nextId: "d" },
      ],
      elseNextId: "d",
    },
    { id: "c", type: "close" },
    { id: "d", type: "convert_to_ticket", title: "Follow up" },
    {
      id: "e",
      type: "let_keeni_answer",
      maxSteps: 6,
      outcomeRouting: {
        resolvedNext: "a",
        unresolvedNext: null,
        escalatedNext: "c",
      },
    },
  ],
};

describe("collectWorkflowEdges", () => {
  it("includes trigger edge and branch paths instead of linear branches edge", () => {
    const edges = collectWorkflowEdges(base);
    expect(edges.some((e) => e.kind === "trigger" && e.target === "a")).toBe(true);
    expect(edges.some((e) => e.source === "b" && e.target === "c" && e.kind === "branch")).toBe(
      true,
    );
    expect(edges.some((e) => e.source === "b" && e.target === "d")).toBe(true);
    expect(edges.some((e) => e.source === "b" && e.target === "a")).toBe(false);
  });

  it("renders let_keeni_answer outcome edges when configured", () => {
    const edges = collectWorkflowEdges(base);
    expect(edges.some((e) => e.source === "e" && e.target === "a" && e.label === "Resolved")).toBe(
      true,
    );
    expect(edges.some((e) => e.source === "e" && e.target === "c" && e.label === "Escalated")).toBe(
      true,
    );
  });

  it("does not create a linear edge after end blocks", () => {
    const edges = collectWorkflowEdges({
      trigger: "first_message",
      blocks: [
        { id: "a", type: "send_message", plainText: "Hi" },
        { id: "stop", type: "end" },
        { id: "after", type: "send_message", plainText: "Later" },
      ],
    });

    expect(edges.some((edge) => edge.source === "stop" && edge.target === "after")).toBe(false);
  });

  it("renders goto target edges instead of linear next edges", () => {
    const edges = collectWorkflowEdges({
      trigger: "first_message",
      blocks: [
        { id: "jump", type: "goto", targetBlockId: "target" },
        { id: "skipped", type: "send_message", plainText: "Skipped" },
        { id: "target", type: "send_message", plainText: "Target" },
      ],
    });

    expect(edges.some((edge) => edge.source === "jump" && edge.target === "target")).toBe(true);
    expect(edges.some((edge) => edge.source === "jump" && edge.target === "skipped")).toBe(false);
  });
});

describe("blockCategory", () => {
  it("maps block types to visual categories", () => {
    expect(blockCategory({ id: "1", type: "send_message" })).toBe("message");
    expect(
      blockCategory({ id: "reply-time", type: "show_expected_reply_time", fallbackMinutes: 120 }),
    ).toBe("message");
    expect(blockCategory({ id: "2", type: "branches", branches: [{ nextId: null }] })).toBe(
      "condition",
    );
    expect(blockCategory({ id: "3", type: "wait", seconds: 1 })).toBe("action");
  });
});

describe("blockLabel", () => {
  it("labels mark_priority blocks", () => {
    expect(blockLabel({ id: "p", type: "mark_priority", priority: "urgent" })).toBe(
      "Priority → urgent",
    );
    expect(blockLabel({ id: "reopen", type: "reopen" })).toBe("Reopen conversation");
    expect(blockLabel({ id: "end", type: "end" })).toBe("End path");
    expect(blockLabel({ id: "goto", type: "goto", targetBlockId: "target" })).toBe("Go to target");
    expect(blockLabel({ id: "sla", type: "apply_sla" })).toBe("Apply active SLA");
    expect(
      blockLabel({ id: "reply-time", type: "show_expected_reply_time", fallbackMinutes: 90 }),
    ).toBe("Expected reply: 90 min");
    expect(blockLabel({ id: "disable", type: "disable_customer_reply", disabled: true })).toBe(
      "Disable customer replies",
    );
    expect(
      blockLabel({
        id: "collect-reply",
        type: "collect_customer_reply",
        bufferSeconds: 2,
      }),
    ).toBe("Wait for customer reply (2s buffer)");
    expect(blockLabel({ id: "tag-user", type: "tag_end_user", tags: ["vip"] })).toBe(
      "Tag end user: vip",
    );
    expect(blockLabel({ id: "state", type: "set_ticket_state", statusName: "Done" })).toBe(
      "Ticket state → Done",
    );
    expect(
      blockLabel({
        id: "ticket-form",
        type: "send_ticket_form",
        prompt: "Please share ticket details.",
        fields: [{ key: "impact", label: "Impact", type: "text", required: true }],
      }),
    ).toBe("Ticket form (1 field(s))");
    expect(
      blockLabel({
        id: "mcp",
        type: "mcp_call",
        serverId: "stub",
        toolName: "echo",
        arguments: { message: "hello" },
      }),
    ).toBe("MCP stub.echo");
  });
});

describe("highlightBlocksFromRunSteps", () => {
  it("collects executed and failed block ids from run steps", () => {
    const highlight = highlightBlocksFromRunSteps([
      { blockId: "a", type: "send_message", status: "completed" },
      { blockId: "b", type: "branches", status: "failed", error: "timeout" },
    ]);
    expect([...highlight.executed]).toEqual(["a", "b"]);
    expect([...highlight.failed]).toEqual(["b"]);
  });
});
