import { describe, expect, it } from "vitest";
import { adaptDingTalkRobot } from "./inbound/dingtalk.js";

describe("adaptDingTalkRobot", () => {
  it("parses text robot callbacks with session webhook", () => {
    const parsed = adaptDingTalkRobot({
      msgtype: "text",
      text: { content: "你好，需要帮助" },
      msgId: "msg-1",
      conversationId: "cid-789",
      senderId: "user-1",
      sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
    });

    expect(parsed?.channelType).toBe("dingtalk");
    expect(parsed?.channelId).toBe("cid-789");
    expect(parsed?.plainText).toBe("你好，需要帮助");
    expect(parsed?.conversationAttributes?.sessionWebhook).toContain("sendBySession");
  });
});
