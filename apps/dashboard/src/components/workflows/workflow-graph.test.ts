import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "../../lib/api";
import { blockCategory, collectWorkflowEdges } from "./workflow-graph";

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
});

describe("blockCategory", () => {
  it("maps block types to visual categories", () => {
    expect(blockCategory({ id: "1", type: "send_message" })).toBe("message");
    expect(blockCategory({ id: "2", type: "branches", branches: [{ nextId: null }] })).toBe(
      "condition",
    );
    expect(blockCategory({ id: "3", type: "wait", seconds: 1 })).toBe("action");
  });
});
