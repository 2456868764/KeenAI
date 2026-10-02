import { describe, expect, it } from "vitest";
import { discordRuntimeEventId, slackRuntimeEventId } from "./channel-connection-supervisor.js";

describe("channel runtime provider event ids", () => {
  it("keeps Discord lifecycle events for the same message distinct by sequence", () => {
    expect(
      discordRuntimeEventId({
        t: "MESSAGE_CREATE",
        s: 10,
        d: { id: "message-1", channel_id: "channel-1" },
      }),
    ).toBe("discord:MESSAGE_CREATE:10");
    expect(
      discordRuntimeEventId({
        t: "MESSAGE_UPDATE",
        s: 11,
        d: { id: "message-1", channel_id: "channel-1" },
      }),
    ).toBe("discord:MESSAGE_UPDATE:11");
    expect(
      discordRuntimeEventId({
        t: "MESSAGE_REACTION_ADD",
        s: 12,
        d: { message_id: "message-1", channel_id: "channel-1" },
      }),
    ).toBe("discord:MESSAGE_REACTION_ADD:12");
  });

  it("admits Slack reactions and message lifecycle callbacks by event id", () => {
    expect(
      slackRuntimeEventId({
        type: "event_callback",
        event_id: "Ev-reaction",
        event: { type: "reaction_added" },
      }),
    ).toBe("Ev-reaction");
    expect(
      slackRuntimeEventId({
        type: "event_callback",
        event_id: "Ev-delete",
        event: { type: "message", subtype: "message_deleted" },
      }),
    ).toBe("Ev-delete");
  });
});
