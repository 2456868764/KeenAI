import type { MessagePart, OutboundDirectives } from "@keenai/shared";

export const CHANNEL_TYPES = [
  "widget",
  "email",
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "wecom",
  "feishu",
  "dingtalk",
] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_CAPABILITIES = [
  "text",
  "markdown",
  "attachments",
  "reactions",
  "threads",
  "typing",
  "read_receipts",
  "delivery_receipts",
  "interactive",
] as const;

export type ChannelCapability = (typeof CHANNEL_CAPABILITIES)[number];

export type ChannelConnectionConfig = {
  connectionId: string;
  orgId: string;
  brandId: string;
  channelType: ChannelType;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type ChannelWebhookRequest = {
  headers: Readonly<Record<string, string | undefined>>;
  query: Readonly<Record<string, string | undefined>>;
  rawBody: Uint8Array;
  receivedAt: Date;
};

export type ChannelVerificationResult =
  | { accepted: true }
  | { accepted: false; status: number; reason: string };

export type ChannelProviderEvent = {
  providerEventId: string;
  eventType: string;
  occurredAt?: Date;
  payload: unknown;
};

export type ChannelInboundAttachment = {
  providerAttachmentId?: string;
  url?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
};

export type ChannelInboundEnvelope = {
  providerEventId: string;
  providerMessageId: string;
  channelType: ChannelType;
  externalAccountId?: string;
  externalThreadId: string;
  externalUserId: string;
  plainText: string;
  parts: MessagePart[];
  attachments: ChannelInboundAttachment[];
  replyToProviderMessageId?: string;
  occurredAt?: Date;
  attributes?: Record<string, unknown>;
};

export type ChannelRoutingContext = {
  orgId: string;
  brandId: string;
  connectionId: string;
  conversationId?: string;
};

export type ChannelOutboundEnvelope = {
  deliveryId: string;
  orgId: string;
  brandId: string;
  connectionId: string;
  conversationId: string;
  messageId: string;
  channelType: ChannelType;
  externalThreadId: string;
  replyToProviderMessageId?: string;
  parts: MessagePart[];
  directives?: OutboundDirectives;
  metadata?: Record<string, unknown>;
};

export type ChannelSendResult = {
  providerMessageIds: string[];
  acceptedAt: Date;
  providerResponse?: unknown;
};

export type ChannelDeliveryReceipt = {
  providerMessageId: string;
  status: "accepted" | "sent" | "delivered" | "read" | "failed";
  occurredAt: Date;
  errorCode?: string;
  errorMessage?: string;
  payload?: unknown;
};

export type ChannelErrorDisposition =
  | "retryable"
  | "terminal"
  | "rate_limited"
  | "unknown_after_send";

export type ChannelClassifiedError = {
  disposition: ChannelErrorDisposition;
  code: string;
  message: string;
  retryAfterMs?: number;
};

export interface ChannelPlugin {
  readonly type: ChannelType;
  readonly capabilities: ReadonlySet<ChannelCapability>;

  verifyWebhook?(
    request: ChannelWebhookRequest,
    connection: ChannelConnectionConfig,
  ): Promise<ChannelVerificationResult>;

  parseWebhook?(
    request: ChannelWebhookRequest,
    connection: ChannelConnectionConfig,
  ): Promise<ChannelProviderEvent[]>;

  normalizeInbound?(
    event: ChannelProviderEvent,
    connection: ChannelConnectionConfig,
  ): Promise<ChannelInboundEnvelope | null>;

  send(
    envelope: ChannelOutboundEnvelope,
    connection: ChannelConnectionConfig,
  ): Promise<ChannelSendResult>;

  parseDeliveryReceipts?(
    request: ChannelWebhookRequest,
    connection: ChannelConnectionConfig,
  ): Promise<ChannelDeliveryReceipt[]>;

  classifyError(error: unknown): ChannelClassifiedError;
}

export class ChannelPluginRegistry {
  private readonly plugins = new Map<ChannelType, ChannelPlugin>();

  register(plugin: ChannelPlugin): void {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`Channel plugin already registered: ${plugin.type}`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  get(type: ChannelType): ChannelPlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) throw new Error(`Channel plugin is not registered: ${type}`);
    return plugin;
  }

  has(type: ChannelType): boolean {
    return this.plugins.has(type);
  }

  list(): ChannelPlugin[] {
    return [...this.plugins.values()];
  }
}
