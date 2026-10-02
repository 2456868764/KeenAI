import { describe, expect, it } from "vitest";
import { adaptTelegramUpdate, splitTelegramUpdate } from "./inbound/telegram.js";
import { planTelegramOutbound } from "./outbound/telegram.js";

describe("adaptTelegramUpdate", () => {
  it("normalizes callback queries as workflow button interactions", () => {
    expect(
      adaptTelegramUpdate({
        update_id: 10,
        callback_query: {
          id: "callback-1",
          from: { id: 42 },
          data: "sales",
          message: { message_id: 99, chat: { id: 123 } },
        },
      }),
    ).toMatchObject({
      platformMessageId: "callback-1",
      channelId: "123",
      userId: "42",
      replyToMessageId: "99",
      interaction: { type: "button", id: "sales" },
    });
  });
  it("parses photo message with caption", () => {
    const result = adaptTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 42,
        from: { id: 998877, first_name: "Jane" },
        chat: { id: 556677, type: "private" },
        photo: [
          { file_id: "small", width: 90, height: 90, file_size: 900 },
          { file_id: "large", width: 800, height: 600, file_size: 50_000 },
        ],
        caption: "Check this screenshot",
      },
    });

    expect(result?.channelType).toBe("telegram");
    expect(result?.channelId).toBe("556677");
    expect(result?.plainText).toBe("Check this screenshot");
    expect(result?.messageKind).toBe("photo");
    expect(result?.attachments).toHaveLength(1);
    expect(result?.attachments[0]?.platformRef).toBe("large");
  });

  it("parses voice message", () => {
    const result = adaptTelegramUpdate({
      update_id: 2,
      message: {
        message_id: 43,
        from: { id: 1 },
        chat: { id: 99 },
        voice: { file_id: "voice123", mime_type: "audio/ogg", file_size: 4096 },
      },
    });

    expect(result?.messageKind).toBe("voice");
    expect(result?.attachments[0]?.contentType).toBe("audio/ogg");
  });

  it("isolates Telegram forum topics and preserves the topic target", () => {
    const result = adaptTelegramUpdate({
      update_id: 3,
      message: {
        message_id: 44,
        message_thread_id: 777,
        from: { id: 1 },
        chat: { id: -100123, type: "supergroup" },
        text: "Topic question",
      },
    });

    expect(result).toMatchObject({
      channelId: "-100123",
      conversationKey: "-100123:topic:777",
      providerThreadId: "777",
    });
  });

  it("normalizes edited messages and reaction replacement", () => {
    const edited = adaptTelegramUpdate({
      update_id: 4,
      edited_message: {
        message_id: 45,
        from: { id: 1 },
        chat: { id: 99 },
        text: "Corrected",
      },
    });
    const reaction = adaptTelegramUpdate({
      update_id: 5,
      message_reaction: {
        chat: { id: 99 },
        message_id: 45,
        user: { id: 2 },
        old_reaction: [{ type: "emoji", emoji: "👍" }],
        new_reaction: [{ type: "emoji", emoji: "❤️" }],
      },
    });

    expect(edited?.mutation).toEqual({
      type: "message.updated",
      targetProviderMessageId: "45",
      replaceAttachments: false,
    });
    expect(reaction?.mutation).toEqual({
      type: "reactions.replaced",
      targetProviderMessageId: "45",
      actorId: "2",
      oldEmojis: ["👍"],
      newEmojis: ["❤️"],
    });
  });

  it("normalizes Telegram Business messages, edits, and batched deletes", () => {
    const message = adaptTelegramUpdate({
      update_id: 11,
      business_message: {
        message_id: 51,
        business_connection_id: "business-1",
        from: { id: 7 },
        chat: { id: 99, type: "private" },
        text: "Business question",
      },
    });
    const edited = adaptTelegramUpdate({
      update_id: 12,
      edited_business_message: {
        message_id: 51,
        business_connection_id: "business-1",
        from: { id: 7 },
        chat: { id: 99, type: "private" },
        text: "Corrected business question",
      },
    });
    const deletedUpdates = splitTelegramUpdate({
      update_id: 13,
      deleted_business_messages: {
        business_connection_id: "business-1",
        chat: { id: 99, type: "private" },
        message_ids: [51, 52],
      },
    });

    expect(message).toMatchObject({
      platformMessageId: "51",
      channelId: "99",
      conversationAttributes: { businessConnectionId: "business-1" },
    });
    expect(edited?.mutation).toEqual({
      type: "message.updated",
      targetProviderMessageId: "51",
      replaceAttachments: false,
    });
    expect(deletedUpdates).toHaveLength(2);
    expect(deletedUpdates.map(adaptTelegramUpdate)).toEqual([
      expect.objectContaining({
        platformMessageId: "51",
        mutation: { type: "message.deleted", targetProviderMessageId: "51" },
        conversationAttributes: { businessConnectionId: "business-1" },
      }),
      expect.objectContaining({
        platformMessageId: "52",
        mutation: { type: "message.deleted", targetProviderMessageId: "52" },
      }),
    ]);
  });

  it("normalizes sticker, video note, location, contact, poll, and channel posts", () => {
    const sticker = adaptTelegramUpdate({
      update_id: 6,
      message: {
        message_id: 46,
        chat: { id: 99 },
        sticker: { file_id: "sticker-1", is_animated: true },
      },
    });
    const videoNote = adaptTelegramUpdate({
      update_id: 7,
      message: { message_id: 47, chat: { id: 99 }, video_note: { file_id: "note-1" } },
    });
    const location = adaptTelegramUpdate({
      update_id: 8,
      message: {
        message_id: 48,
        chat: { id: 99 },
        location: { latitude: 1.2, longitude: 3.4 },
      },
    });
    const contact = adaptTelegramUpdate({
      update_id: 9,
      message: {
        message_id: 49,
        chat: { id: 99 },
        contact: { first_name: "Ada", last_name: "Lovelace", phone_number: "+123" },
      },
    });
    const poll = adaptTelegramUpdate({
      update_id: 10,
      channel_post: {
        message_id: 50,
        chat: { id: -100 },
        poll: { question: "Choose", options: [{ text: "A" }, { text: "B" }] },
      },
    });

    expect(sticker?.attachments[0]).toMatchObject({
      contentType: "application/x-tgsticker",
      fileName: "sticker.tgs",
    });
    expect(sticker?.messageKind).toBe("sticker");
    expect(videoNote?.messageKind).toBe("video");
    expect(location?.plainText).toBe("[Location: 1.2, 3.4]");
    expect(contact?.plainText).toContain("Ada Lovelace, +123");
    expect(poll?.plainText).toBe("[Poll: Choose\n- A\n- B]");
  });
});

describe("planTelegramOutbound", () => {
  it("plans sendPhoto with caption for image reply", () => {
    const actions = planTelegramOutbound({
      platform: "telegram",
      targetId: "556677",
      parts: [
        { type: "text", text: "Here is the diagram." },
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

    expect(actions).toHaveLength(1);
    expect(actions[0]?.method).toBe("sendPhoto");
    if (actions[0]?.method === "sendPhoto") {
      expect(actions[0].caption).toBe("Here is the diagram.");
    }
  });

  it("plans sendVoice when asVoice directive is set", () => {
    const actions = planTelegramOutbound({
      platform: "telegram",
      targetId: "99",
      parts: [{ type: "audio", attachmentId: "voice1" }],
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
      directives: { asVoice: true },
    });

    expect(actions[0]?.method).toBe("sendVoice");
  });

  it("projects the stored Telegram topic onto every outbound action", () => {
    const actions = planTelegramOutbound({
      platform: "telegram",
      targetId: "-100123",
      parts: [{ type: "text", text: "Topic answer" }],
      attachments: new Map(),
      channelAttributes: { providerThreadId: "777" },
    });

    expect(actions).toEqual([
      expect.objectContaining({
        method: "sendMessage",
        chatId: "-100123",
        messageThreadId: 777,
      }),
    ]);
  });

  it("projects the Telegram Business connection onto every outbound action", () => {
    const actions = planTelegramOutbound({
      platform: "telegram",
      targetId: "99",
      parts: [
        { type: "text", text: "Business answer" },
        { type: "image", attachmentId: "image-1" },
      ],
      attachments: new Map([
        [
          "image-1",
          {
            attachmentId: "image-1",
            contentUrl: "https://api.example/attachments/image-1/content",
            contentType: "image/png",
            fileName: "answer.png",
          },
        ],
      ]),
      channelAttributes: { businessConnectionId: "business-1" },
    });

    expect(actions).not.toHaveLength(0);
    expect(actions.every((action) => action.businessConnectionId === "business-1")).toBe(true);
  });
});
