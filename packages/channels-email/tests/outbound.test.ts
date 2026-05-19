import { describe, expect, it } from "vitest";
import { renderAgentReplyHtml, renderAgentReplyText } from "../src/templates.js";

describe("email templates", () => {
  it("renders agent reply text and html", () => {
    const vars = {
      agentName: "Alex",
      plainText: "We refunded your order.",
      conversationSubject: "Billing",
    };
    expect(renderAgentReplyText(vars)).toContain("refunded");
    expect(renderAgentReplyHtml(vars)).toContain("<p>");
  });
});
