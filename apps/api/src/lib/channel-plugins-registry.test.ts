import { CHANNEL_TYPES } from "@keenai/channels-core";
import { beforeEach, describe, expect, it } from "vitest";
import { getChannelPluginRegistry, resetChannelPluginRegistryForTests } from "./channel-plugins.js";
import { subscribeConversation } from "./conversation-bus.js";

describe("channel plugin registry", () => {
  beforeEach(() => resetChannelPluginRegistryForTests());

  it("registers every channel in the official plugin contract", () => {
    const plugins = getChannelPluginRegistry().list();
    const registered = plugins.map((plugin) => plugin.type).sort();

    expect(registered).toEqual([...CHANNEL_TYPES].sort());
    expect(
      Object.fromEntries(plugins.map((plugin) => [plugin.type, [...plugin.capabilities].sort()])),
    ).toEqual({
      telegram: [
        "attachments",
        "interactive",
        "message_delete",
        "message_edit",
        "reactions",
        "text",
        "threads",
        "typing",
      ],
      slack: [
        "attachments",
        "interactive",
        "markdown",
        "message_delete",
        "message_edit",
        "reactions",
        "text",
        "threads",
      ],
      discord: [
        "attachments",
        "interactive",
        "markdown",
        "message_delete",
        "message_edit",
        "reactions",
        "text",
        "threads",
        "typing",
      ],
      feishu: [
        "attachments",
        "delivery_receipts",
        "interactive",
        "message_delete",
        "message_edit",
        "reactions",
        "read_receipts",
        "text",
        "threads",
      ],
      dingtalk: ["attachments", "interactive", "message_delete", "text"],
      whatsapp: [
        "attachments",
        "delivery_receipts",
        "interactive",
        "reactions",
        "read_receipts",
        "templates",
        "text",
        "threads",
        "typing",
      ],
      wechat: ["attachments", "interactive", "text"],
      wecom: ["attachments", "interactive", "message_delete", "text"],
      email: ["attachments", "delivery_receipts", "markdown", "read_receipts", "text", "threads"],
      widget: [
        "attachments",
        "delivery_receipts",
        "interactive",
        "markdown",
        "message_delete",
        "message_edit",
        "reactions",
        "read_receipts",
        "text",
        "typing",
      ],
    });
  });

  it("publishes the outbound limits enforced by each channel planner", () => {
    const registry = getChannelPluginRegistry();

    expect(
      Object.fromEntries(registry.list().map((plugin) => [plugin.type, plugin.outboundLimits])),
    ).toEqual({
      telegram: limits(4096, 4096, 1024),
      slack: limits(4000, 3000),
      discord: limits(2000, 2000),
      feishu: limits(4000, 4000),
      dingtalk: limits(4000, 4000),
      whatsapp: limits(4096, 1024, 1024),
      wechat: limits(2048, 1024),
      wecom: limits(2048, 128),
      email: limits(null, null),
      widget: limits(50_000, 50_000),
    });
  });

  it("broadcasts widget typing operations through the conversation bus", async () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeConversation("conversation-1", (event) => events.push(event));
    const plugin = getChannelPluginRegistry().get("widget");

    await plugin.executeMessageOperation?.(
      {
        type: "typing",
        orgId: "org-1",
        brandId: "brand-1",
        connectionId: "widget-connection",
        conversationId: "conversation-1",
        channelType: "widget",
        externalThreadId: "conversation-1",
      },
      {
        connectionId: "widget-connection",
        orgId: "org-1",
        brandId: "brand-1",
        channelType: "widget",
        credentials: {},
        settings: {},
      },
    );
    unsubscribe();

    expect(events).toEqual([
      expect.objectContaining({
        type: "typing",
        conversationId: "conversation-1",
        actorType: "agent",
      }),
    ]);
  });
});

function limits(
  maxTextCharacters: number | null,
  maxInteractiveTextCharacters: number | null,
  maxCaptionCharacters: number | null = null,
) {
  return {
    maxTextCharacters,
    maxInteractiveTextCharacters,
    maxCaptionCharacters,
    maxAttachmentBytes: null,
  };
}
