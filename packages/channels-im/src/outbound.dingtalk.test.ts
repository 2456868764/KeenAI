import { describe, expect, it } from "vitest";
import { planDingTalkOutbound } from "./outbound/dingtalk.js";

describe("planDingTalkOutbound", () => {
  it("plans an official group robot send when conversation identity is available", () => {
    const actions = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "cid-group",
      parts: [{ type: "text", text: "Group reply" }],
      attachments: new Map(),
      channelAttributes: {
        robotCode: "robot-code",
        conversationType: "2",
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
      },
    });

    expect(actions).toEqual([
      {
        platform: "dingtalk",
        method: "robot.groupMessages.send",
        robotCode: "robot-code",
        openConversationId: "cid-group",
        msgKey: "sampleText",
        msgParam: JSON.stringify({ content: "Group reply" }),
      },
    ]);
  });

  it("plans an official direct robot send to the inbound staff member", () => {
    const actions = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "cid-direct",
      parts: [{ type: "text", text: "Direct reply" }],
      attachments: new Map(),
      channelAttributes: {
        robotCode: "robot-code",
        conversationType: "1",
        senderStaffId: "staff-1",
      },
    });

    expect(actions).toEqual([
      {
        platform: "dingtalk",
        method: "robot.oToMessages.batchSend",
        robotCode: "robot-code",
        userIds: ["staff-1"],
        msgKey: "sampleText",
        msgParam: JSON.stringify({ content: "Direct reply" }),
      },
    ]);
  });

  it("plans session webhook send when webhook is stored", () => {
    const actions = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "cid-789",
      parts: [{ type: "text", text: "We can help with that." }],
      attachments: new Map(),
      channelAttributes: {
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
      },
    });

    expect(actions).toEqual([
      {
        platform: "dingtalk",
        method: "sessionWebhook.send",
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
        text: "We can help with that.",
      },
    ]);
  });

  it("uses a markdown message for linked media", () => {
    const actions = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "cid-789",
      parts: [
        { type: "text", text: "Screenshot" },
        { type: "image", attachmentId: "att-1", alt: "Dashboard" },
      ],
      attachments: new Map([
        [
          "att-1",
          {
            attachmentId: "att-1",
            contentUrl: "https://cdn.example/dashboard.png",
            contentType: "image/png",
            fileName: "dashboard.png",
          },
        ],
      ]),
      channelAttributes: {
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
      },
    });

    expect(actions).toEqual([
      {
        platform: "dingtalk",
        method: "sessionWebhook.markdown",
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=abc",
        title: "Screenshot",
        text: "Screenshot\n\n![Dashboard](https://cdn.example/dashboard.png)",
      },
    ]);
  });

  it("does not use an expired session webhook as a fallback", () => {
    const actions = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "cid-789",
      parts: [{ type: "text", text: "Too late" }],
      attachments: new Map(),
      channelAttributes: {
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=expired",
        sessionWebhookExpiredTime: 1,
      },
    });

    expect(actions).toEqual([]);
  });

  it("projects official robot action cards with reachable button URLs", () => {
    const actions = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "cid-group",
      parts: [{ type: "text", text: "Choose" }],
      attachments: new Map(),
      directives: {
        interaction: {
          buttons: [{ id: "sales", label: "Sales", url: "https://app.example/sales" }],
        },
      },
      channelAttributes: { robotCode: "robot-code", conversationType: "2" },
    });

    expect(actions).toEqual([
      {
        platform: "dingtalk",
        method: "robot.groupMessages.send",
        robotCode: "robot-code",
        openConversationId: "cid-group",
        msgKey: "sampleActionCard",
        msgParam: JSON.stringify({
          title: "Choose",
          text: "Choose",
          btnOrientation: "0",
          btns: [{ title: "Sales", actionURL: "https://app.example/sales" }],
        }),
      },
    ]);
  });
});
