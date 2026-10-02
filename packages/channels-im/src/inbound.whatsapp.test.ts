import { describe, expect, it } from "vitest";
import { adaptWhatsAppWebhook } from "./inbound/whatsapp.js";
import { planWhatsAppOutbound } from "./outbound/whatsapp.js";

describe("adaptWhatsAppWebhook", () => {
  it("normalizes interactive button replies", () => {
    expect(
      adaptWhatsAppWebhook({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      id: "wamid.click",
                      from: "15551234567",
                      type: "interactive",
                      context: { id: "wamid.prompt" },
                      interactive: {
                        type: "button_reply",
                        button_reply: { id: "sales", title: "Sales" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      platformMessageId: "wamid.click",
      replyToMessageId: "wamid.prompt",
      plainText: "Sales",
      interaction: { type: "button", id: "sales" },
    });
  });
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

  it("normalizes locations, contacts, and stickers", () => {
    const location = adaptWhatsAppWebhook(
      singleMessage({
        id: "wamid.location",
        from: "15551234567",
        type: "location",
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          name: "Office",
          address: "Market Street",
        },
      }),
    );
    const contacts = adaptWhatsAppWebhook(
      singleMessage({
        id: "wamid.contacts",
        from: "15551234567",
        type: "contacts",
        contacts: [
          {
            name: { formatted_name: "Alex Doe" },
            phones: [{ phone: "+1 555 0100" }],
            emails: [{ email: "alex@example.com" }],
          },
        ],
      }),
    );
    const sticker = adaptWhatsAppWebhook(
      singleMessage({
        id: "wamid.sticker",
        from: "15551234567",
        type: "sticker",
        sticker: { id: "sticker-1", mime_type: "image/webp" },
      }),
    );

    expect(location?.plainText).toContain("Office - Market Street");
    expect(contacts?.plainText).toContain("Alex Doe, +1 555 0100, alex@example.com");
    expect(sticker?.messageKind).toBe("sticker");
    expect(sticker?.attachments[0]).toMatchObject({
      platformRef: "sticker-1",
      contentType: "image/webp",
    });
  });

  it("normalizes reaction add and removal mutations", () => {
    const added = adaptWhatsAppWebhook(
      singleMessage({
        id: "wamid.reaction.add",
        from: "15551234567",
        type: "reaction",
        reaction: { message_id: "wamid.target", emoji: "👍" },
      }),
    );
    const removed = adaptWhatsAppWebhook(
      singleMessage({
        id: "wamid.reaction.remove",
        from: "15551234567",
        type: "reaction",
        reaction: { message_id: "wamid.target", emoji: "" },
      }),
    );

    expect(added?.mutation).toEqual({
      type: "reaction.added",
      targetProviderMessageId: "wamid.target",
      actorId: "15551234567",
      emoji: "👍",
    });
    expect(removed?.mutation).toEqual({
      type: "reaction.removed",
      targetProviderMessageId: "wamid.target",
      actorId: "15551234567",
      emoji: "*",
    });
  });
});

function singleMessage(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [message] } }] }],
  };
}

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
