import { describe, expect, it } from "vitest";
import { adaptWeComMessage } from "./inbound/wecom.js";

describe("adaptWeComMessage", () => {
  it("normalizes template card button events", () => {
    expect(
      adaptWeComMessage({
        MsgType: "event",
        Event: "template_card_event",
        EventKey: "sales",
        ResponseCode: "response-1",
        FromUserName: "user-1",
        AgentID: 1001,
      }),
    ).toMatchObject({
      platformMessageId: "response-1",
      channelId: "user-1",
      userId: "user-1",
      interaction: { type: "button", id: "sales" },
    });
  });
  it("normalizes official voice callbacks", () => {
    const parsed = adaptWeComMessage({
      MsgId: "msg-voice-1",
      MsgType: "voice",
      FromUserName: "user-1",
      MediaId: "media-1",
      Format: "amr",
      AgentID: "1001",
    });

    expect(parsed?.messageKind).toBe("voice");
    expect(parsed?.plainText).toBe("[Voice message]");
    expect(parsed?.attachments[0]).toMatchObject({
      platform: "wecom",
      platformRef: "media-1",
      contentType: "audio/amr",
    });
  });
});
