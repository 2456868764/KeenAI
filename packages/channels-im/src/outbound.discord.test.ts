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
});
