import { describe, expect, it } from "vitest";
import { formatDraftToolSummary } from "./draft-tools.js";

describe("formatDraftToolSummary", () => {
  it("lists tool names for the copilot system prompt", () => {
    const summary = formatDraftToolSummary([
      {
        name: "extend_trial",
        description: "Extend trial",
        parametersSchema: { type: "object", properties: {} },
        execute: async () => ({}),
      },
    ]);
    expect(summary).toBe("Available tools: extend_trial");
  });
});
