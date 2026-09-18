import type {
  ChannelClassifiedError,
  ChannelConnectionConfig,
  ChannelOutboundEnvelope,
  ChannelPlugin,
  ChannelSendResult,
} from "@keenai/channels-core";

export type WidgetDeliveryExecutor = (
  envelope: ChannelOutboundEnvelope,
  connection: ChannelConnectionConfig,
) => Promise<ChannelSendResult>;

export function createWidgetChannelPlugin(execute: WidgetDeliveryExecutor): ChannelPlugin {
  return {
    type: "widget",
    capabilities: new Set([
      "text",
      "markdown",
      "attachments",
      "typing",
      "read_receipts",
      "delivery_receipts",
      "interactive",
    ]),
    send: execute,
    classifyError: classifyWidgetError,
  };
}

function classifyWidgetError(error: unknown): ChannelClassifiedError {
  const candidate = error as { code?: unknown };
  const code = typeof candidate?.code === "string" ? candidate.code : "widget_delivery_failed";
  const message = error instanceof Error ? error.message : String(error);
  const terminal = code === "conversation_not_found" || code === "connection_not_found";
  return { disposition: terminal ? "terminal" : "retryable", code, message };
}
