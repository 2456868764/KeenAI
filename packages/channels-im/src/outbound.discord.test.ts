import { describe, expect, it } from "vitest";
import { planDiscordOutbound } from "./outbound/discord.js";

describe("planDiscordOutbound", () => {
  it("plans createMessage for text reply", () => {
    const actions = planDiscordOutbound({
      platform: "discord",
      targetId: "chan-1",
      parts: [{ type: "text", text: "Thanks for reaching out!" }],
      attachments: new Map(),
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      platform: "discord",
      method: "createMessage",
      channelId: "chan-1",
      content: "Thanks for reaching out!",
    });
  });

  it("plans multipart file messages without dropping the text caption", () => {
    const actions = planDiscordOutbound({
      platform: "discord",
      targetId: "chan-1",
      parts: [
        { type: "text", text: "See the screenshot." },
        { type: "image", attachmentId: "att-1", alt: "Failure screen" },
      ],
      attachments: new Map([
        [
          "att-1",
          {
            attachmentId: "att-1",
            contentUrl: "https://cdn.example/failure.png",
            contentType: "image/png",
            fileName: "failure.png",
          },
        ],
      ]),
    });

    expect(actions).toEqual([
      {
        platform: "discord",
        method: "createMessageWithFile",
        channelId: "chan-1",
        content: "See the screenshot.",
        fileUrl: "https://cdn.example/failure.png",
        fileName: "failure.png",
        contentType: "image/png",
        description: "Failure screen",
      },
    ]);
  });
});
