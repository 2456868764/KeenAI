import { describe, expect, it } from "vitest";
import { planImOutbound } from "./index.js";
import type { ImPlatform } from "./types.js";

const buttons = [
  { id: "sales", label: "Sales", callbackUrl: "https://app.example/actions/sales" },
  { id: "support", label: "Support", callbackUrl: "https://app.example/actions/support" },
];

describe("interactive outbound planning", () => {
  it.each<ImPlatform>(["telegram", "slack", "discord", "feishu", "dingtalk", "whatsapp", "wecom"])(
    "projects workflow buttons for %s",
    (platform) => {
      const actions = planImOutbound({
        platform,
        targetId: "thread-1",
        parts: [{ type: "text", text: "Choose a team" }],
        attachments: new Map(),
        directives: { interaction: { buttons } },
        channelAttributes:
          platform === "dingtalk"
            ? { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" }
            : platform === "wecom"
              ? { wecomAgentId: 1001 }
              : {},
      });

      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ platform, buttons });
    },
  );

  it("plans an approved WhatsApp template instead of a free-form message", () => {
    expect(
      planImOutbound({
        platform: "whatsapp",
        targetId: "15551234567",
        parts: [{ type: "text", text: "ignored" }],
        attachments: new Map(),
        directives: {
          whatsappTemplate: {
            name: "support_follow_up",
            languageCode: "en_US",
            components: [{ type: "body", parameters: [{ type: "text", text: "Case 42" }] }],
          },
        },
      }),
    ).toEqual([
      {
        platform: "whatsapp",
        method: "messages.template",
        to: "15551234567",
        templateName: "support_follow_up",
        languageCode: "en_US",
        components: [{ type: "body", parameters: [{ type: "text", text: "Case 42" }] }],
      },
    ]);
  });
});
