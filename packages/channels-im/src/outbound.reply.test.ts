import { describe, expect, it } from "vitest";
import { planImOutbound } from "./index.js";
import type { ImPlatform } from "./types.js";

describe("IM outbound reply context", () => {
  it.each([
    ["telegram", "replyToMessageId"],
    ["slack", "threadTs"],
    ["discord", "replyToMessageId"],
    ["feishu", "replyToMessageId"],
    ["whatsapp", "replyToMessageId"],
  ] as const)("projects reply context for %s", (platform, property) => {
    const actions = planImOutbound({
      platform: platform as ImPlatform,
      targetId: "thread-1",
      parts: [{ type: "text", text: "Reply" }],
      attachments: new Map(),
      replyToMessageId: "provider-message-1",
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveProperty(property, "provider-message-1");
  });
});
