import { describe, expect, it } from "vitest";
import { planDingTalkOutbound } from "./outbound/dingtalk.js";
import { planDiscordOutbound } from "./outbound/discord.js";
import { planFeishuOutbound } from "./outbound/feishu.js";
import { planSlackOutbound } from "./outbound/slack.js";
import { planTelegramOutbound } from "./outbound/telegram.js";
import { splitOutboundText } from "./outbound/text.js";
import { planWeChatOutbound } from "./outbound/wechat.js";
import { planWeComOutbound } from "./outbound/wecom.js";
import { planWhatsAppOutbound } from "./outbound/whatsapp.js";

const button = { id: "continue", label: "Continue" };

describe("splitOutboundText", () => {
  it("splits by Unicode code point without losing content", () => {
    const text = "🙂🙂🙂🙂🙂";
    const chunks = splitOutboundText(text, 2);

    expect(chunks).toEqual(["🙂🙂", "🙂🙂", "🙂"]);
    expect(chunks.join("")).toBe(text);
  });
});

describe("outbound provider text limits", () => {
  it("preserves long Telegram and WhatsApp messages and attaches buttons once", () => {
    const text = "🙂".repeat(4_500);
    const telegram = planTelegramOutbound({
      platform: "telegram",
      targetId: "chat-1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      directives: { interaction: { buttons: [button] } },
    });
    const telegramMessages = telegram.filter((action) => action.method === "sendMessage");
    expect(telegramMessages.map((action) => action.text).join("")).toBe(text);
    expect(telegramMessages.every((action) => Array.from(action.text).length <= 4_096)).toBe(true);
    expect(telegramMessages.filter((action) => action.buttons?.length)).toHaveLength(1);
    expect(telegramMessages.at(-1)?.buttons).toEqual([button]);

    const whatsapp = planWhatsAppOutbound({
      platform: "whatsapp",
      targetId: "15551234567",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      directives: { interaction: { buttons: [button] } },
    });
    const whatsappMessages = whatsapp.filter((action) => action.method === "messages.text");
    expect(whatsappMessages.map((action) => action.text).join("")).toBe(text);
    expect(whatsappMessages.every((action) => Array.from(action.text).length <= 1_024)).toBe(true);
    expect(whatsappMessages.filter((action) => action.buttons?.length)).toHaveLength(1);
    expect(whatsappMessages.at(-1)?.buttons).toEqual([button]);
  });

  it("preserves long Slack, Discord, and Feishu messages", () => {
    const text = "x".repeat(8_500);
    const slack = planSlackOutbound({
      platform: "slack",
      targetId: "C1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      directives: { interaction: { buttons: [button] } },
    }).filter((action) => action.method === "chat.postMessage");
    expect(slack.map((action) => action.text).join("")).toBe(text);
    expect(slack.every((action) => action.text.length <= 3_000)).toBe(true);
    expect(slack.filter((action) => action.buttons?.length)).toHaveLength(1);

    const discord = planDiscordOutbound({
      platform: "discord",
      targetId: "C1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      directives: { interaction: { buttons: [button] } },
    }).filter((action) => action.method === "createMessage");
    expect(discord.map((action) => action.content).join("")).toBe(text);
    expect(discord.every((action) => action.content.length <= 2_000)).toBe(true);
    expect(discord.filter((action) => action.buttons?.length)).toHaveLength(1);

    const feishu = planFeishuOutbound({
      platform: "feishu",
      targetId: "oc_1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      directives: { interaction: { buttons: [button] } },
    }).filter((action) => action.method === "im.message.create");
    expect(feishu.map((action) => action.text).join("")).toBe(text);
    expect(feishu.every((action) => action.text.length <= 4_000)).toBe(true);
    expect(feishu.filter((action) => action.buttons?.length)).toHaveLength(1);
  });

  it("preserves long DingTalk, WeChat, and WeCom messages", () => {
    const text = "x".repeat(8_500);
    const dingtalk = planDingTalkOutbound({
      platform: "dingtalk",
      targetId: "C1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      channelAttributes: { sessionWebhook: "https://example.test/session" },
      directives: {
        interaction: {
          buttons: [{ ...button, url: "https://app.example/continue" }],
        },
      },
    });
    const dingtalkSessionMessages = dingtalk.filter(
      (action) =>
        action.method === "sessionWebhook.send" ||
        action.method === "sessionWebhook.markdown" ||
        action.method === "sessionWebhook.actionCard",
    );
    expect(dingtalkSessionMessages.map((action) => action.text).join("")).toBe(text);
    expect(dingtalkSessionMessages.every((action) => action.text.length <= 4_000)).toBe(true);
    expect(dingtalk.filter((action) => action.method === "sessionWebhook.actionCard")).toHaveLength(
      1,
    );

    const wechat = planWeChatOutbound({
      platform: "wechat",
      targetId: "openid-1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      directives: { interaction: { buttons: [button] } },
    }).filter((action) => action.method === "message.send");
    expect(wechat.map((action) => action.text).join("")).toBe(text);
    expect(wechat.every((action) => action.text.length <= 1_024)).toBe(true);
    expect(wechat.filter((action) => action.buttons?.length)).toHaveLength(1);

    const wecom = planWeComOutbound({
      platform: "wecom",
      targetId: "user-1",
      parts: [{ type: "text", text }],
      attachments: new Map(),
      channelAttributes: { wecomAgentId: 1001 },
      directives: { interaction: { buttons: [button] } },
    }).filter((action) => action.method === "message.send");
    expect(wecom.map((action) => action.text).join("")).toBe(text);
    expect(wecom.every((action) => action.text.length <= 128)).toBe(true);
    expect(wecom.filter((action) => action.buttons?.length)).toHaveLength(1);
  });

  it("moves overlong media captions into lossless text messages", () => {
    const text = "x".repeat(5_000);
    const attachment = {
      attachmentId: "image-1",
      contentUrl: "https://cdn.example/image.png",
      contentType: "image/png",
      fileName: "image.png",
    };
    const telegram = planTelegramOutbound({
      platform: "telegram",
      targetId: "chat-1",
      parts: [
        { type: "text", text },
        { type: "image", attachmentId: "image-1" },
      ],
      attachments: new Map([["image-1", attachment]]),
    });
    expect(
      telegram
        .filter((action) => action.method === "sendMessage")
        .map((action) => action.text)
        .join(""),
    ).toBe(text);
    expect(telegram.at(-1)).toMatchObject({ method: "sendPhoto", caption: undefined });

    const whatsapp = planWhatsAppOutbound({
      platform: "whatsapp",
      targetId: "15551234567",
      parts: [
        { type: "text", text },
        { type: "image", attachmentId: "image-1" },
      ],
      attachments: new Map([["image-1", attachment]]),
    });
    expect(
      whatsapp
        .filter((action) => action.method === "messages.text")
        .map((action) => action.text)
        .join(""),
    ).toBe(text);
    expect(whatsapp.at(-1)).toMatchObject({ method: "messages.image", caption: undefined });
  });

  it("does not lose WhatsApp text when a referenced attachment is unavailable", () => {
    const actions = planWhatsAppOutbound({
      platform: "whatsapp",
      targetId: "15551234567",
      parts: [
        { type: "text", text: "Keep this text" },
        { type: "image", attachmentId: "missing" },
      ],
      attachments: new Map(),
    });

    expect(actions).toEqual([
      {
        platform: "whatsapp",
        method: "messages.text",
        to: "15551234567",
        text: "Keep this text",
        buttons: undefined,
      },
    ]);
  });
});
