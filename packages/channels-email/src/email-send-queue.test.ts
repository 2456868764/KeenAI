import { describe, expect, it } from "vitest";
import { createInMemoryEmailSendHandler } from "./email-send-queue.js";

describe("email send queue", () => {
  it("sendEmailNow handler rejects without live SMTP", async () => {
    const handler = createInMemoryEmailSendHandler({
      host: "127.0.0.1",
      port: 19999,
      from: "noreply@test.local",
      user: "u",
      pass: "p",
    });

    await expect(
      handler({
        to: "customer@test.local",
        subject: "Re: Help",
        plainText: "Hello",
        agentName: "Agent",
        conversationSubject: "Help",
      }),
    ).rejects.toThrow();
  });
});
