import { describe, expect, it } from "vitest";
import { adaptSlackEvent, slackUrlVerificationChallenge } from "./inbound/slack.js";
import { planSlackOutbound } from "./outbound/slack.js";

describe("adaptSlackEvent", () => {
  it("returns challenge for url verification", () => {
    expect(slackUrlVerificationChallenge({ type: "url_verification", challenge: "abc" })).toBe(
      "abc",
    );
  });

  it("parses file_share message with image", () => {
    const result = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        subtype: "file_share",
        channel: "C123",
        user: "U456",
        ts: "1234.5678",
        files: [
          {
            id: "F789",
            name: "screenshot.png",
            mimetype: "image/png",
            size: 12_345,
            url_private_download: "https://files.slack.com/secret",
          },
        ],
      },
    });

    expect(result?.channelType).toBe("slack");
    expect(result?.channelId).toBe("C123");
    expect(result?.messageKind).toBe("photo");
    expect(result?.attachments[0]?.platformRef).toContain("slack.com");
  });

  it("ignores bot messages", () => {
    const result = adaptSlackEvent({
      type: "event_callback",
      event: {
        type: "message",
        channel: "C1",
        ts: "1.0",
        bot_id: "B1",
        text: "automated",
      },
    });
    expect(result).toBeNull();
  });
});

describe("planSlackOutbound", () => {
  it("uploads files after optional text", () => {
    const actions = planSlackOutbound({
      platform: "slack",
      targetId: "C123",
      parts: [
        { type: "text", text: "Invoice attached." },
        { type: "file", attachmentId: "att1", fileName: "invoice.pdf" },
      ],
      attachments: new Map([
        [
          "att1",
          {
            attachmentId: "att1",
            contentUrl: "https://api.example/attachments/att1/content",
            contentType: "application/pdf",
            fileName: "invoice.pdf",
          },
        ],
      ]),
    });

    expect(actions).toHaveLength(2);
    expect(actions[0]?.method).toBe("chat.postMessage");
    expect(actions[1]?.method).toBe("files.upload");
  });
});
