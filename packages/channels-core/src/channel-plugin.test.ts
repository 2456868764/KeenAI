import { describe, expect, it } from "vitest";
import {
  type ChannelConnectionConfig,
  type ChannelOutboundEnvelope,
  type ChannelPlugin,
  ChannelPluginRegistry,
} from "./channel-plugin.js";

const widgetPlugin: ChannelPlugin = {
  type: "widget",
  capabilities: new Set(["text"]),
  async send(_envelope: ChannelOutboundEnvelope, _connection: ChannelConnectionConfig) {
    return { providerMessageIds: ["message-1"], acceptedAt: new Date() };
  },
  classifyError(error) {
    return { disposition: "terminal", code: "widget_error", message: String(error) };
  },
};

describe("ChannelPluginRegistry", () => {
  it("registers and resolves a plugin", () => {
    const registry = new ChannelPluginRegistry();
    registry.register(widgetPlugin);

    expect(registry.has("widget")).toBe(true);
    expect(registry.get("widget")).toBe(widgetPlugin);
    expect(registry.list()).toEqual([widgetPlugin]);
  });

  it("rejects duplicate registrations", () => {
    const registry = new ChannelPluginRegistry();
    registry.register(widgetPlugin);

    expect(() => registry.register(widgetPlugin)).toThrow(
      "Channel plugin already registered: widget",
    );
  });

  it("rejects missing plugins", () => {
    const registry = new ChannelPluginRegistry();
    expect(() => registry.get("email")).toThrow("Channel plugin is not registered: email");
  });
});
