import { describe, expect, it } from "vitest";
import { adaptWeChatMessage } from "./inbound/wechat.js";

describe("adaptWeChatMessage", () => {
  it("normalizes customer-service menu selections as workflow button interactions", () => {
    const parsed = adaptWeChatMessage({
      ToUserName: "official-account",
      FromUserName: "openid-1",
      CreateTime: 1_700_000_000,
      MsgType: "text",
      Content: "Sales",
      MsgId: "message-menu-1",
      bizmsgmenuid: "sales",
    });

    expect(parsed).toMatchObject({
      platformMessageId: "message-menu-1",
      channelType: "wechat",
      channelId: "openid-1",
      plainText: "Sales",
      interaction: { type: "button", id: "sales" },
    });
  });

  it("normalizes text messages by OpenID", () => {
    expect(
      adaptWeChatMessage({
        ToUserName: "gh-account",
        FromUserName: "openid-1",
        CreateTime: "1700000000",
        MsgType: "text",
        Content: "Need help",
        MsgId: "message-1",
      }),
    ).toMatchObject({
      channelType: "wechat",
      channelId: "openid-1",
      userId: "openid-1",
      plainText: "Need help",
      platformMessageId: "message-1",
      conversationAttributes: { wechatAppId: "gh-account" },
    });
  });

  it("normalizes voice media and recognition text", () => {
    const parsed = adaptWeChatMessage({
      ToUserName: "gh-account",
      FromUserName: "openid-1",
      MsgType: "voice",
      MediaId: "media-1",
      Format: "amr",
      Recognition: "billing question",
      MsgId: "message-2",
    });

    expect(parsed?.messageKind).toBe("voice");
    expect(parsed?.attachments[0]).toMatchObject({
      platform: "wechat",
      platformRef: "media-1",
      contentType: "audio/amr",
    });
    expect(parsed?.conversationAttributes).toMatchObject({
      voiceRecognition: "billing question",
    });
  });

  it("normalizes menu click events for workflow interactions", () => {
    expect(
      adaptWeChatMessage({
        ToUserName: "gh-account",
        FromUserName: "openid-1",
        CreateTime: "1700000000",
        MsgType: "event",
        Event: "CLICK",
        EventKey: "billing",
      }),
    ).toMatchObject({ interaction: { type: "button", id: "billing" } });
  });
});
