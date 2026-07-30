import { describe, expect, it } from "vitest";
import {
  formatCommaList,
  formatWebhookHeaders,
  parseCommaList,
  parseWebhookHeaders,
} from "./workflow-formats";

describe("webhook header formatting", () => {
  it("formats headers as editable header lines", () => {
    expect(
      formatWebhookHeaders({
        Authorization: "Bearer token",
        "X-KeenAI-Event": "workflow.updated",
      }),
    ).toBe("Authorization: Bearer token\nX-KeenAI-Event: workflow.updated");
  });

  it("parses valid header lines and ignores incomplete lines", () => {
    expect(
      parseWebhookHeaders(`
        Authorization: Bearer token
        invalid-header
        X-Signature: sha256:abc123
        Empty:
      `),
    ).toEqual({
      Authorization: "Bearer token",
      "X-Signature": "sha256:abc123",
    });
  });

  it("returns undefined when no valid headers are present", () => {
    expect(parseWebhookHeaders("invalid\nEmpty:")).toBeUndefined();
    expect(formatWebhookHeaders(undefined)).toBe("");
  });
});

describe("comma-list formatting", () => {
  it("formats and parses comma-separated lists", () => {
    expect(formatCommaList(["kb.search", "ticket.lookup"])).toBe("kb.search, ticket.lookup");
    expect(parseCommaList("kb.search, ticket.lookup, , conversation.read")).toEqual([
      "kb.search",
      "ticket.lookup",
      "conversation.read",
    ]);
  });

  it("returns undefined for empty comma-separated lists", () => {
    expect(formatCommaList(undefined)).toBe("");
    expect(parseCommaList(" , ")).toBeUndefined();
  });
});
