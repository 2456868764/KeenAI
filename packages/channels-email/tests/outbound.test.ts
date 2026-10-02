import { describe, expect, it } from "vitest";
import { sendOutboundEmail } from "../src/outbound.js";
import {
  renderAgentMarkdownHtml,
  renderAgentReplyHtml,
  renderAgentReplyText,
} from "../src/templates.js";

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

  it("renders safe markdown email HTML", () => {
    const html = renderAgentMarkdownHtml("**Answer** <script>alert(1)</script>");
    expect(html).toContain("<strong>Answer</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("passes MIME attachments to the transport", async () => {
    const sent: unknown[] = [];
    const transport = {
      sendMail: async (input: unknown) => {
        sent.push(input);
        return { messageId: "msg-1" };
      },
    };

    await sendOutboundEmail(transport as never, "support@test.local", {
      to: "customer@test.local",
      subject: "Re: Attachment",
      plainText: "See attached.",
      attachments: [
        {
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          contentBase64: Buffer.from("pdf").toString("base64"),
        },
      ],
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      attachments: [
        {
          filename: "invoice.pdf",
          contentType: "application/pdf",
          disposition: "attachment",
        },
      ],
    });
  });
});
