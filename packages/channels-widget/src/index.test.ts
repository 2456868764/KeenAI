import type {
  ChannelConnectionConfig,
  ChannelMessageOperation,
  ChannelOutboundEnvelope,
} from "@keenai/channels-core";
import { describe, expect, it, vi } from "vitest";
import { createWidgetChannelPlugin } from "./index.js";

const connection: ChannelConnectionConfig = {
  connectionId: "widget-connection",
  orgId: "org-1",
  brandId: "brand-1",
  channelType: "widget",
  credentials: {},
  settings: {},
};

describe("widget channel plugin", () => {
  it("advertises realtime operations only when an operation executor is configured", () => {
    const send = vi.fn(async (_envelope: ChannelOutboundEnvelope) => ({
      providerMessageIds: ["message-1"],
      acceptedAt: new Date(),
    }));

    expect([...createWidgetChannelPlugin(send).capabilities]).not.toEqual(
      expect.arrayContaining(["typing", "reactions", "message_edit", "message_delete"]),
    );
    expect([...createWidgetChannelPlugin(send, vi.fn()).capabilities]).toEqual(
      expect.arrayContaining(["typing", "reactions", "message_edit", "message_delete"]),
    );
  });

  it("delegates transient message operations", async () => {
    const completedAt = new Date("2026-09-23T12:00:00.000Z");
    const executeMessageOperation = vi.fn(async () => ({ completedAt }));
    const plugin = createWidgetChannelPlugin(
      vi.fn(async () => ({
        providerMessageIds: ["message-1"],
        acceptedAt: completedAt,
      })),
      executeMessageOperation,
    );
    const operation: ChannelMessageOperation = {
      type: "typing",
      orgId: "org-1",
      brandId: "brand-1",
      connectionId: connection.connectionId,
      conversationId: "conversation-1",
      channelType: "widget",
      externalThreadId: "conversation-1",
    };

    await expect(plugin.executeMessageOperation?.(operation, connection)).resolves.toEqual({
      completedAt,
    });
    expect(executeMessageOperation).toHaveBeenCalledWith(operation, connection);
  });
});
