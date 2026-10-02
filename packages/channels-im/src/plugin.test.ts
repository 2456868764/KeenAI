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
  "wechat",
  "wecom",
];

describe("IM channel plugin contract", () => {
  it("registers every supported IM platform with truthful capabilities", () => {
    const plugins = createDefaultImPlugins(async () => ({ providerMessageIds: [] }));
    expect(plugins.map((plugin) => plugin.type)).toEqual(platforms);

    const capabilities = Object.fromEntries(
      plugins.map((plugin) => [plugin.type, [...plugin.capabilities].sort()]),
    );
    expect(capabilities.telegram).toEqual(["attachments", "interactive", "text", "threads"]);
    expect(capabilities.slack).toEqual([
      "attachments",
      "interactive",
      "markdown",
      "text",
      "threads",
    ]);
    expect(capabilities.discord).toEqual([
      "attachments",
      "interactive",
      "markdown",
      "text",
      "threads",
    ]);
    expect(capabilities.feishu).toEqual([
      "attachments",
      "delivery_receipts",
      "interactive",
      "read_receipts",
      "text",
      "threads",
    ]);
    expect(capabilities.dingtalk).toEqual(["attachments", "interactive", "text"]);
    expect(capabilities.whatsapp).toEqual([
      "attachments",
      "delivery_receipts",
      "interactive",
      "read_receipts",
      "templates",
      "text",
      "threads",
    ]);
    expect(capabilities.wechat).toEqual(["attachments", "interactive", "text"]);
    expect(capabilities.wecom).toEqual(["attachments", "interactive", "text"]);
  });

  it("advertises only implemented message operations", () => {
    const executeActions = async () => ({ providerMessageIds: [] });
    const executeOperation = async () => ({ completedAt: new Date() });
    const plugins = createDefaultImPlugins(executeActions, executeOperation);
    const capabilities = Object.fromEntries(
      plugins.map((plugin) => [plugin.type, [...plugin.capabilities].sort()]),
    );

    expect(capabilities.telegram).toEqual([
      "attachments",
      "interactive",
      "message_delete",
      "message_edit",
      "reactions",
      "text",
      "threads",
      "typing",
    ]);
    expect(capabilities.slack).toContain("reactions");
    expect(capabilities.slack).not.toContain("typing");
    expect(capabilities.discord).toContain("typing");
    expect(capabilities.feishu).toEqual([
      "attachments",
      "delivery_receipts",
      "interactive",
      "message_delete",
      "message_edit",
      "reactions",
      "read_receipts",
      "text",
      "threads",
    ]);
    expect(capabilities.dingtalk).toContain("message_delete");
    expect(capabilities.whatsapp).toContain("reactions");
    expect(capabilities.whatsapp).toContain("templates");
    expect(capabilities.wecom).toContain("message_delete");
  });

  it("classifies provider timeouts as unknown-after-send outcomes", () => {
    const [plugin] = createDefaultImPlugins(async () => ({ providerMessageIds: [] }));

    expect(plugin?.classifyError(new DOMException("timed out", "TimeoutError"))).toMatchObject({
      disposition: "unknown_after_send",
      code: "unknown_after_send",
    });
  });

  it("splits every WhatsApp message in a batched webhook into a provider event", async () => {
    const plugin = createDefaultImPlugins(async () => ({ providerMessageIds: [] })).find(
      (item) => item.type === "whatsapp",
    );
    const connection: ChannelConnectionConfig = {
      connectionId: "whatsapp-connection",
      orgId: "org-1",
      brandId: "brand-1",
      channelType: "whatsapp",
      credentials: {},
      settings: {},
    };
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "phone-1" },
                contacts: [{ wa_id: "15551234567", profile: { name: "Jane" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "15551234567",
                    type: "text",
                    text: { body: "First" },
                  },
                  {
                    id: "wamid.2",
                    from: "15551234567",
                    type: "text",
                    text: { body: "Second" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = await plugin?.parseWebhook?.(
      {
        headers: {},
        query: {},
        rawBody: new TextEncoder().encode(JSON.stringify(payload)),
        receivedAt: new Date(),
      },
      connection,
    );
    const normalized = await Promise.all(
      (events ?? []).map((event) => plugin?.normalizeInbound?.(event, connection)),
    );

    expect(events?.map((event) => event.providerEventId)).toEqual(["wamid.1", "wamid.2"]);
    expect(normalized.map((message) => message?.plainText)).toEqual(["First", "Second"]);
    expect(normalized[1]?.attributes).toMatchObject({
      whatsappPhoneNumberId: "phone-1",
      profileName: "Jane",
    });
  });

  it("splits Telegram Business deletes into uniquely deduplicated provider events", async () => {
    const plugin = createDefaultImPlugins(async () => ({ providerMessageIds: [] })).find(
      (item) => item.type === "telegram",
    );
    const connection: ChannelConnectionConfig = {
      connectionId: "telegram-connection",
      orgId: "org-1",
      brandId: "brand-1",
      channelType: "telegram",
      credentials: {},
      settings: {},
    };
    const events = await plugin?.parseWebhook?.(
      {
        headers: {},
        query: {},
        rawBody: new TextEncoder().encode(
          JSON.stringify({
            update_id: 99,
            deleted_business_messages: {
              business_connection_id: "business-1",
              chat: { id: 123 },
              message_ids: [7, 8],
            },
          }),
        ),
        receivedAt: new Date(),
      },
      connection,
    );
    const normalized = await Promise.all(
      (events ?? []).map((event) => plugin?.normalizeInbound?.(event, connection)),
    );

    expect(events?.map((event) => event.providerEventId)).toEqual([
      "99:deleted_business_message:7",
      "99:deleted_business_message:8",
    ]);
    expect(normalized.map((message) => message?.mutation)).toEqual([
      { type: "message.deleted", targetProviderMessageId: "7" },
      { type: "message.deleted", targetProviderMessageId: "8" },
    ]);
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
