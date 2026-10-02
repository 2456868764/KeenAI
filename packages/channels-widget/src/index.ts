import type {
  ChannelCapability,
  ChannelClassifiedError,
  ChannelConnectionConfig,
  ChannelMessageOperation,
  ChannelMessageOperationResult,
  ChannelOutboundEnvelope,
  ChannelPlugin,
  ChannelSendResult,
} from "@keenai/channels-core";

export type WidgetDeliveryExecutor = (
  envelope: ChannelOutboundEnvelope,
  connection: ChannelConnectionConfig,
) => Promise<ChannelSendResult>;

export type WidgetMessageOperationExecutor = (
  operation: ChannelMessageOperation,
  connection: ChannelConnectionConfig,
) => Promise<ChannelMessageOperationResult>;

export function createWidgetChannelPlugin(
  execute: WidgetDeliveryExecutor,
  executeMessageOperation?: WidgetMessageOperationExecutor,
): ChannelPlugin {
  const capabilities = new Set<ChannelCapability>([
    "text",
    "markdown",
    "attachments",
    "read_receipts",
    "delivery_receipts",
    "interactive",
  ]);
  if (executeMessageOperation) {
    capabilities.add("typing");
    capabilities.add("reactions");
    capabilities.add("message_edit");
    capabilities.add("message_delete");
  }
  return {
    type: "widget",
    capabilities,
    outboundLimits: {
      maxTextCharacters: 50_000,
      maxInteractiveTextCharacters: 50_000,
      maxCaptionCharacters: null,
      maxAttachmentBytes: null,
    },
    send: execute,
    executeMessageOperation,
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
