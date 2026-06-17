import { describe, expect, it } from "vitest";
import { planFeishuOutbound } from "./outbound/feishu.js";

describe("planFeishuOutbound", () => {
  it("plans im.message.create for text parts", () => {
    const actions = planFeishuOutbound({
      platform: "feishu",
      targetId: "oc_456",
      parts: [{ type: "text", text: "Thanks for reaching out." }],
      attachments: new Map(),
    });

    expect(actions).toEqual([
      {
        platform: "feishu",
        method: "im.message.create",
        receiveId: "oc_456",
        receiveIdType: "chat_id",
        text: "Thanks for reaching out.",
      },
    ]);
  });
});
