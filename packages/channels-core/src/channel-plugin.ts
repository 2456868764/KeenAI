import type { MessagePart, OutboundDirectives } from "@keenai/shared";

export const CHANNEL_TYPES = [
  "widget",
  "email",
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "wechat",
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
  "message_edit",
  "message_delete",
  "read_receipts",
  "delivery_receipts",
  "interactive",
  "templates",
] as const;

export type ChannelCapability = (typeof CHANNEL_CAPABILITIES)[number];

/**
 * Provider-facing outbound limits. A null value means the effective limit is
 * determined at runtime by the connection, account, or upload configuration.
 */
export type ChannelOutboundLimits = {
  maxTextCharacters: number | null;
  maxInteractiveTextCharacters: number | null;
  maxCaptionCharacters: number | null;
  maxAttachmentBytes: number | null;
};

export type ChannelConnectionConfig = {
  connectionId: string;
  orgId: string;
  brandId: string;
  channelType: ChannelType;
  transport?: "webhook" | "gateway" | "polling" | "stream";
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

export type ChannelInboundMutation =
  | {
      type: "message.updated" | "message.deleted";
      targetProviderMessageId: string;
      replaceAttachments?: boolean;
    }
  | {
      type: "reaction.added" | "reaction.removed";
      targetProviderMessageId: string;
      actorId: string;
      emoji: string;
    }
  | {
      type: "reactions.replaced";
      targetProviderMessageId: string;
      actorId: string;
      oldEmojis: string[];
      newEmojis: string[];
    };

export type ChannelInboundEnvelope = {
  providerEventId: string;
  providerMessageId: string;
  channelType: ChannelType;
  externalAccountId?: string;
  /** Stable provider conversation key. */
  externalThreadId: string;
  /** Actual provider destination when the conversation key is composite. */
  externalTargetId?: string;
  /** Provider thread root used for default replies. */
  threadRootProviderMessageId?: string;
  externalUserId: string;
  plainText: string;
  parts: MessagePart[];
  attachments: ChannelInboundAttachment[];
  replyToProviderMessageId?: string;
  occurredAt?: Date;
  /** Provider-side mutation. Absent means a newly created message. */
  mutation?: ChannelInboundMutation;
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
  providerMessageRefs?: ChannelProviderMessageRef[];
  acceptedAt: Date;
  providerResponse?: unknown;
};

export type ChannelProviderMessageRef = {
  providerMessageId: string;
  /** Provider operation that created this external resource. */
  providerAction?: string;
  resourceType: "message" | "file";
  actionIndex: number;
};

type ChannelMessageOperationTarget = {
  orgId: string;
  brandId: string;
  connectionId: string;
  conversationId: string;
  messageId?: string;
  channelType: ChannelType;
  externalThreadId: string;
  providerMessageId?: string;
  providerAction?: string;
  providerResourceType?: "message" | "file";
  channelAttributes?: Record<string, unknown>;
};

export type ChannelMessageOperation =
  | (ChannelMessageOperationTarget & {
      type: "typing";
    })
  | (ChannelMessageOperationTarget & {
      type: "reaction.add" | "reaction.remove";
      providerMessageId: string;
      emoji: string;
    })
  | (ChannelMessageOperationTarget & {
      type: "edit";
      providerMessageId: string;
      parts: MessagePart[];
      directives?: OutboundDirectives;
    })
  | (ChannelMessageOperationTarget & {
      type: "delete";
      providerMessageId: string;
    });

export type ChannelMessageOperationResult = {
  completedAt: Date;
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
  readonly outboundLimits: Readonly<ChannelOutboundLimits>;

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

  executeMessageOperation?(
    operation: ChannelMessageOperation,
    connection: ChannelConnectionConfig,
  ): Promise<ChannelMessageOperationResult>;

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
