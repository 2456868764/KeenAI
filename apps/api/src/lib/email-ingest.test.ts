import type { ParsedInboundEmailWithAttachments } from "@keenai/channels-email";
import { describe, expect, it } from "vitest";
import { limitInboundEmailAttachments } from "./email-ingest.js";

describe("limitInboundEmailAttachments", () => {
  it("keeps the message and omits attachments over the configured byte limit", () => {
    const parsed: ParsedInboundEmailWithAttachments = {
      messageId: "message@example.com",
      from: { address: "customer@example.com" },
      to: [{ address: "support@example.com" }],
      subject: "Logs",
      plainText: "Please inspect the attached logs.",
      references: [],
      attachments: [
        {
          fileName: "small.txt",
          contentType: "text/plain",
          sizeBytes: 999,
          content: Buffer.from("ok"),
        },
        {
          fileName: "large\n[archive].zip",
          contentType: "application/zip",
          sizeBytes: 1,
          content: Buffer.alloc(11),
        },
      ],
    };

    const result = limitInboundEmailAttachments(parsed, 10);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.fileName).toBe("small.txt");
    expect(result.attachments[0]?.sizeBytes).toBe(2);
    expect(result.plainText).toContain("Please inspect the attached logs.");
    expect(result.plainText).toContain(
      "[Attachment omitted: large__archive_.zip exceeds 10 bytes]",
    );
  });
});
