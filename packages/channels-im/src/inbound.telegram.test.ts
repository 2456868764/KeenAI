import { describe, expect, it } from "vitest";
import { adaptTelegramUpdate } from "./inbound/telegram.js";
import { planTelegramOutbound } from "./outbound/telegram.js";

describe("adaptTelegramUpdate", () => {
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
});
