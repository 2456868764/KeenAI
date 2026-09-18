import type { ChannelConnectionConfig, ChannelOutboundEnvelope } from "@keenai/channels-core";
import { describe, expect, it, vi } from "vitest";
import { createDefaultImPlugins } from "./plugin.js";
import type { ImOutboundAction, ImPlatform } from "./types.js";

const platforms: ImPlatform[] = [
  "telegram",
  "slack",
  "discord",
  "feishu",
  "dingtalk",
  "whatsapp",
  "wecom",
];

describe("IM channel plugin contract", () => {
  it("registers every supported IM platform with truthful capabilities", () => {
    const plugins = createDefaultImPlugins(async () => ({ providerMessageIds: [] }));
    expect(plugins.map((plugin) => plugin.type)).toEqual(platforms);

    const capabilities = Object.fromEntries(
      plugins.map((plugin) => [plugin.type, [...plugin.capabilities].sort()]),
    );
    expect(capabilities.telegram).toEqual(["attachments", "text", "threads"]);
    expect(capabilities.slack).toEqual(["attachments", "text", "threads"]);
    expect(capabilities.discord).toEqual(["attachments", "text", "threads"]);
    expect(capabilities.feishu).toEqual(["delivery_receipts", "text"]);
    expect(capabilities.dingtalk).toEqual(["text"]);
    expect(capabilities.whatsapp).toEqual(["attachments", "delivery_receipts", "text"]);
    expect(capabilities.wecom).toEqual(["text"]);
  });

  it.each(platforms)(
    "plans a %s outbound action through the common send contract",
    async (platform) => {
      const execute = vi.fn(async (actions: ImOutboundAction[]) => ({
        providerMessageIds: [`${platform}-message-1`],
        providerResponse: { actionCount: actions.length },
      }));
      const plugin = createDefaultImPlugins(execute).find((item) => item.type === platform);
      expect(plugin).toBeDefined();

      const connection: ChannelConnectionConfig = {
        connectionId: `${platform}-connection`,
        orgId: "org-1",
        brandId: "brand-1",
        channelType: platform,
        credentials: {},
        settings:
          platform === "dingtalk"
            ? { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession" }
            : platform === "wecom"
              ? { wecomAgentId: 1001 }
              : {},
      };
      const envelope: ChannelOutboundEnvelope = {
        deliveryId: "delivery-1",
        orgId: "org-1",
        brandId: "brand-1",
        connectionId: connection.connectionId,
        conversationId: "conversation-1",
        messageId: "message-1",
        channelType: platform,
        externalThreadId: "external-thread-1",
        parts: [{ type: "text", text: "Hello from KeenAI" }],
      };

      const result = await plugin?.send(envelope, connection);
      expect(result?.providerMessageIds).toEqual([`${platform}-message-1`]);
      expect(execute).toHaveBeenCalledTimes(1);
      const actions = execute.mock.calls[0]?.[0];
      expect(actions).toHaveLength(1);
      expect(actions?.[0]?.platform).toBe(platform);
    },
  );
});
