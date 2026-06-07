import { describe, expect, it } from "vitest";
import { type ApplyRulesBlock, resolveApplyRulesMatches } from "./apply-rules.js";

describe("resolveApplyRulesMatches", () => {
  const block: ApplyRulesBlock = {
    id: "rules-1",
    type: "apply_rules",
    rules: [
      {
        label: "Messenger",
        condition: { field: "channelType", op: "eq", value: "messenger" },
        nextId: "msg-a",
      },
      {
        label: "Normal priority",
        condition: { field: "priority", op: "eq", value: "normal" },
        nextId: "msg-b",
      },
    ],
  };

  it("returns all matching rule targets", () => {
    const ids = new Set(["msg-a", "msg-b", "rules-1"]);
    expect(
      resolveApplyRulesMatches(block, { channelType: "messenger", priority: "normal" }, ids),
    ).toEqual(["msg-a", "msg-b"]);
  });

  it("skips non-matching rules", () => {
    const ids = new Set(["msg-a", "msg-b", "rules-1"]);
    expect(
      resolveApplyRulesMatches(block, { channelType: "email", priority: "normal" }, ids),
    ).toEqual(["msg-b"]);
  });
});
