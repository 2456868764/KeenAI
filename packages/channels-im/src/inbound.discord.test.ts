import { describe, expect, it } from "vitest";
import { adaptDiscordEvent } from "./inbound/discord.js";

describe("adaptDiscordEvent", () => {
  it("parses MESSAGE_CREATE with text", () => {
    const result = adaptDiscordEvent({
      t: "MESSAGE_CREATE",
      d: {
        id: "msg-1",
        channel_id: "chan-9",
        author: { id: "user-1", bot: false },
        content: "Need billing help",
      },
    });

    expect(result?.channelType).toBe("discord");
    expect(result?.channelId).toBe("chan-9");
    expect(result?.plainText).toBe("Need billing help");
  });

  it("ignores bot messages", () => {
    const result = adaptDiscordEvent({
      message: {
        id: "msg-2",
        channel_id: "chan-9",
        author: { id: "bot-1", bot: true },
        content: "automated",
      },
    });
    expect(result).toBeNull();
  });
});
