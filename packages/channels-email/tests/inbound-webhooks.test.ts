import { describe, expect, it } from "vitest";
import { adaptMailgunInbound, adaptSendGridInbound } from "../src/inbound-webhooks.js";

describe("inbound webhooks", () => {
  it("adapts SendGrid stripped fields", async () => {
    const parsed = await adaptSendGridInbound({
      from: "User <user@test.com>",
      subject: "Hi",
      text: "Question",
      headers: "Message-ID: <sg1@test.com>\n",
    });
    expect(parsed.from.address).toBe("user@test.com");
    expect(parsed.plainText).toBe("Question");
  });

  it("adapts Mailgun stripped fields", async () => {
    const parsed = await adaptMailgunInbound({
      sender: "user@test.com",
      recipient: "inbox@keenai.local",
      subject: "Ping",
      "stripped-text": "Hello",
      "Message-Id": "<mg1@test.com>",
    });
    expect(parsed.messageId).toBe("<mg1@test.com>");
    expect(parsed.plainText).toBe("Hello");
  });
});
