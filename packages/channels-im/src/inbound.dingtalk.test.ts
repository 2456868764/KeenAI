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
      senderStaffId: "staff-1",
      senderCorpId: "sender-corp",
      chatbotCorpId: "bot-corp",
      robotCode: "robot-code",
      conversationType: "2",
      sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
      sessionWebhookExpiredTime: 4_102_444_800_000,
    });

    expect(parsed?.channelType).toBe("dingtalk");
    expect(parsed?.channelId).toBe("cid-789");
    expect(parsed?.plainText).toBe("你好，需要帮助");
    expect(parsed?.conversationAttributes?.sessionWebhook).toContain("sendBySession");
    expect(parsed?.conversationAttributes).toMatchObject({
      chatbotCorpId: "bot-corp",
      senderCorpId: "sender-corp",
      robotCode: "robot-code",
      conversationType: "2",
      senderStaffId: "staff-1",
      sessionWebhookExpiredTime: 4_102_444_800_000,
    });
  });

  it("normalizes file callbacks with a download code", () => {
    const parsed = adaptDingTalkRobot({
      msgtype: "file",
      content: { downloadCode: "download-code", fileName: "contract.pdf" },
      msgId: "msg-file-1",
      conversationId: "cid-789",
      senderId: "user-1",
      robotCode: "robot-code",
    });

    expect(parsed?.messageKind).toBe("document");
    expect(parsed?.plainText).toBe("[File: contract.pdf]");
    expect(parsed?.attachments[0]).toMatchObject({
      platform: "dingtalk",
      fileName: "contract.pdf",
    });
    expect(JSON.parse(parsed?.attachments[0]?.platformRef ?? "{}")).toEqual({
      downloadCode: "download-code",
      robotCode: "robot-code",
    });
  });

  it("normalizes richText callbacks with text and multiple resources", () => {
    const parsed = adaptDingTalkRobot({
      msgtype: "richText",
      content: {
        richText: [
          { type: "text", text: "See " },
          { type: "picture", downloadCode: "image-code", fileName: "screen.jpg" },
          { type: "text", text: " and log" },
          { type: "file", downloadCode: "file-code", fileName: "debug.txt" },
        ],
      },
      msgId: "msg-rich-1",
      conversationId: "cid-789",
      senderId: "user-1",
      robotCode: "robot-code",
    });

    expect(parsed?.plainText).toBe("See  and log");
    expect(parsed?.messageKind).toBe("mixed");
    expect(parsed?.attachments).toHaveLength(2);
    expect(parsed?.parts).toContainEqual({ type: "image", attachmentId: "pending-0" });
    expect(parsed?.parts).toContainEqual({
      type: "file",
      attachmentId: "pending-1",
      fileName: "debug.txt",
    });
  });
});
