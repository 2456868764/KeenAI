import { describe, expect, it } from "vitest";
import { createMessageSchema } from "./conversation.js";

describe("createMessageSchema outbound directives", () => {
  it("accepts a WhatsApp template without synthetic plain text", () => {
    expect(
      createMessageSchema.parse({
        directives: {
          whatsappTemplate: {
            name: "support_follow_up",
            languageCode: "en_US",
            components: [{ type: "body", parameters: [] }],
          },
        },
      }),
    ).toMatchObject({
      isInternal: false,
      directives: {
        whatsappTemplate: { name: "support_follow_up", languageCode: "en_US" },
      },
    });
  });

  it("rejects directives that exceed the bounded template contract", () => {
    const result = createMessageSchema.safeParse({
      directives: {
        whatsappTemplate: {
          name: "support_follow_up",
          languageCode: "en_US",
          components: Array.from({ length: 17 }, () => ({})),
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects templates mixed with ordinary message content", () => {
    const result = createMessageSchema.safeParse({
      plainText: "This text would be ignored by Meta",
      attachmentIds: ["attachment-1"],
      directives: {
        whatsappTemplate: { name: "support_follow_up", languageCode: "en_US" },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("cannot be combined");
    }
  });
});
