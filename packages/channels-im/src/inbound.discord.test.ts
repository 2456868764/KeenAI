import { describe, expect, it } from "vitest";
import { adaptDiscordEvent } from "./inbound/discord.js";

describe("adaptDiscordEvent", () => {
  it("normalizes component interactions", () => {
    expect(
      adaptDiscordEvent({
        t: "INTERACTION_CREATE",
        d: {
          id: "interaction-1",
          channel_id: "channel-1",
          member: { user: { id: "user-1" } },
          data: { custom_id: "support" },
          message: { id: "message-1" },
        },
      }),
    ).toMatchObject({
      platformMessageId: "interaction-1",
      channelId: "channel-1",
      userId: "user-1",
      replyToMessageId: "message-1",
      interaction: { type: "button", id: "support" },
    });
  });

  it("normalizes top-level HTTP component interactions", () => {
    expect(
      adaptDiscordEvent({
        type: 3,
        id: "interaction-http-1",
        guild_id: "guild-1",
        channel_id: "channel-1",
        member: { user: { id: "user-1" } },
        data: { custom_id: "billing" },
        message: { id: "message-1" },
      }),
    ).toMatchObject({
      platformMessageId: "interaction-http-1",
      channelId: "channel-1",
      userId: "user-1",
      interaction: { type: "button", id: "billing" },
      conversationAttributes: { guildId: "guild-1" },
    });
  });
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

  it("preserves Discord reply context", () => {
    const result = adaptDiscordEvent({
      t: "MESSAGE_CREATE",
      d: {
        id: "message-2",
        guild_id: "guild-1",
        channel_id: "channel-1",
        author: { id: "user-1" },
        content: "Following up",
        message_reference: { message_id: "message-1" },
      },
    });

    expect(result?.replyToMessageId).toBe("message-1");
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

  it("normalizes update, delete, and reaction gateway events", () => {
    expect(
      adaptDiscordEvent({
        t: "MESSAGE_UPDATE",
        d: { id: "msg-1", channel_id: "chan-1", content: "Corrected", attachments: [] },
      })?.mutation,
    ).toEqual({
      type: "message.updated",
      targetProviderMessageId: "msg-1",
      replaceAttachments: true,
    });
    expect(
      adaptDiscordEvent({ t: "MESSAGE_DELETE", d: { id: "msg-1", channel_id: "chan-1" } })
        ?.mutation,
    ).toEqual({ type: "message.deleted", targetProviderMessageId: "msg-1" });
    expect(
      adaptDiscordEvent({
        t: "MESSAGE_REACTION_ADD",
        d: {
          message_id: "msg-1",
          channel_id: "chan-1",
          user_id: "user-2",
          emoji: { id: "emoji-1", name: "party" },
        },
      })?.mutation,
    ).toEqual({
      type: "reaction.added",
      targetProviderMessageId: "msg-1",
      actorId: "user-2",
      emoji: "<:party:emoji-1>",
    });
  });
});
