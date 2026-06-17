import { describe, expect, it } from "vitest";
import { adaptFeishuEvent, feishuUrlVerificationChallenge } from "./inbound/feishu.js";

describe("adaptFeishuEvent", () => {
  it("returns challenge for url verification", () => {
    expect(feishuUrlVerificationChallenge({ type: "url_verification", challenge: "abc" })).toBe(
      "abc",
    );
  });

  it("parses im.message.receive_v1 text events", () => {
    const parsed = adaptFeishuEvent({
      schema: "2.0",
      header: { event_type: "im.message.receive_v1", event_id: "evt-1" },
      event: {
        sender: { sender_id: { open_id: "ou_123" } },
        message: {
          message_id: "om_1",
          chat_id: "oc_456",
          message_type: "text",
          content: JSON.stringify({ text: "Need help with billing" }),
        },
      },
    });

    expect(parsed?.channelType).toBe("feishu");
    expect(parsed?.channelId).toBe("oc_456");
    expect(parsed?.plainText).toBe("Need help with billing");
  });
});
