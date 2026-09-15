import { describe, expect, it } from "vitest";
import { createDefaultBranch, createDefaultRule } from "./workflow-route-defaults";

describe("workflow route defaults", () => {
  it("creates schema-valid branch defaults", () => {
    expect(createDefaultBranch(2)).toEqual({
      label: "Branch 2",
      condition: { field: "channelType", op: "eq", value: "messenger" },
      nextId: null,
    });
  });

  it("creates schema-valid apply-rules defaults with the requested target", () => {
    expect(createDefaultRule(3, "target-block")).toEqual({
      label: "Rule 3",
      condition: { field: "channelType", op: "eq", value: "messenger" },
      nextId: "target-block",
    });
  });
});
