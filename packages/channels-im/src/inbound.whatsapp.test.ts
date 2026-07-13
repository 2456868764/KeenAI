import { describe, expect, it } from "vitest";
import { adaptWhatsAppWebhook } from "./inbound/whatsapp.js";
import { planWhatsAppOutbound } from "./outbound/whatsapp.js";

describe("adaptWhatsAppWebhook", () => {
  it("parses text messages", () => {
    const result = adaptWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "phone-1", display_phone_number: "15550000000" },
                contacts: [{ wa_id: "15551234567", profile: { name: "Jane" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "15551234567",
                    timestamp: "1710000000",
                    type: "text",
                    text: { body: "Need help with my order" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result?.channelType).toBe("whatsapp");
    expect(result?.channelId).toBe("15551234567");
    expect(result?.plainText).toBe("Need help with my order");
    expect(result?.messageKind).toBe("text");
    expect(result?.conversationAttributes?.whatsappPhoneNumberId).toBe("phone-1");
  });

  it("parses image messages with caption and reply context", () => {
    const result = adaptWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.2",
                    from: "15551234567",
                    type: "image",
                    image: {
                      id: "media-image-1",
                      mime_type: "image/jpeg",
                      caption: "Screenshot from checkout",
                    },
                    context: { id: "wamid.1" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result?.plainText).toBe("Screenshot from checkout");
    expect(result?.messageKind).toBe("photo");
    expect(result?.replyToMessageId).toBe("wamid.1");
    expect(result?.attachments[0]?.platform).toBe("whatsapp");
    expect(result?.attachments[0]?.platformRef).toBe("media-image-1");
    expect(result?.parts).toEqual([
      { type: "text", text: "Screenshot from checkout" },
      { type: "image", attachmentId: "pending-0" },
    ]);
  });
});

describe("planWhatsAppOutbound", () => {
  it("uses image captions for single media replies", () => {
    const actions = planWhatsAppOutbound({
      platform: "whatsapp",
      targetId: "15551234567",
      parts: [
        { type: "text", text: "Here is the corrected diagram." },
        { type: "image", attachmentId: "att1" },
      ],
      attachments: new Map([
        [
          "att1",
          {
            attachmentId: "att1",
            contentUrl: "https://api.example/attachments/att1/content",
            contentType: "image/png",
            fileName: "diagram.png",
          },
        ],
      ]),
    });

    expect(actions).toEqual([
      {
        platform: "whatsapp",
        method: "messages.image",
        to: "15551234567",
        imageUrl: "https://api.example/attachments/att1/content",
        caption: "Here is the corrected diagram.",
      },
    ]);
  });

  it("sends text separately when audio cannot carry a caption", () => {
    const actions = planWhatsAppOutbound({
      platform: "whatsapp",
      targetId: "15551234567",
      parts: [
        { type: "text", text: "Voice note attached." },
        { type: "audio", attachmentId: "voice1" },
      ],
      attachments: new Map([
        [
          "voice1",
          {
            attachmentId: "voice1",
            contentUrl: "https://api.example/attachments/voice1/content",
            contentType: "audio/ogg",
            fileName: "reply.ogg",
          },
        ],
      ]),
    });

    expect(actions.map((a) => a.method)).toEqual(["messages.text", "messages.audio"]);
  });
});
