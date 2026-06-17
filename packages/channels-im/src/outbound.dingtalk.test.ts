import { describe, expect, it } from "vitest";
import { planDingTalkOutbound } from "./outbound/dingtalk.js";

describe("planDingTalkOutbound", () => {
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
});
