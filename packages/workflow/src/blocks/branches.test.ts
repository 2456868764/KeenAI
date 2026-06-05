import { describe, expect, it } from "vitest";
import { evaluateBranchCondition, resolveBranchesNext } from "./branches.js";

describe("branches block", () => {
  it("evaluates eq/neq conditions", () => {
    expect(
      evaluateBranchCondition(
        { field: "channelType", op: "eq", value: "email" },
        { channelType: "email" },
      ),
    ).toBe(true);
    expect(
      evaluateBranchCondition(
        { field: "channelType", op: "neq", value: "email" },
        { channelType: "email" },
      ),
    ).toBe(false);
  });

  it("resolves first matching branch", () => {
    const next = resolveBranchesNext(
      {
        id: "b1",
        type: "branches",
        branches: [
          {
            label: "email",
            condition: { field: "channelType", op: "eq", value: "email" },
            nextId: "email-path",
          },
          { label: "fallback", nextId: "default-path" },
        ],
        elseNextId: "else-path",
      },
      { channelType: "messenger" },
    );
    expect(next).toBe("default-path");
  });
});
