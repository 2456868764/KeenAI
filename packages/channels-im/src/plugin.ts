import type {
  ChannelCapability,
  ChannelClassifiedError,
  ChannelConnectionConfig,
  ChannelDeliveryReceipt,
  ChannelInboundEnvelope,
  ChannelPlugin,
  ChannelProviderEvent,
  ChannelWebhookRequest,
} from "@keenai/channels-core";
import { adaptDingTalkRobot } from "./inbound/dingtalk.js";
import { adaptDiscordEvent } from "./inbound/discord.js";
import { adaptFeishuEvent, parseFeishuDeliveryReceipts } from "./inbound/feishu.js";
import { adaptSlackEvent } from "./inbound/slack.js";
import { adaptTelegramUpdate } from "./inbound/telegram.js";
import { adaptWeComMessage } from "./inbound/wecom.js";
import { adaptWhatsAppWebhook, parseWhatsAppDeliveryReceipts } from "./inbound/whatsapp.js";
import { planDingTalkOutbound } from "./outbound/dingtalk.js";
import { planDiscordOutbound } from "./outbound/discord.js";
import { planFeishuOutbound } from "./outbound/feishu.js";
import { planSlackOutbound } from "./outbound/slack.js";
import { planTelegramOutbound } from "./outbound/telegram.js";
import { planWeComOutbound } from "./outbound/wecom.js";
import { planWhatsAppOutbound } from "./outbound/whatsapp.js";
import type {
  ImAttachmentRef,
  ImOutboundAction,
  ImPlatform,
  ParsedInboundImMessage,
  PlanImOutboundInput,
} from "./types.js";

export type ImOutboundActionExecutor = (
  actions: ImOutboundAction[],
  connection: ChannelConnectionConfig,
) => Promise<{ providerMessageIds: string[]; providerResponse?: unknown }>;

export type ImChannelPluginOptions = {
  platform: ImPlatform;
  adaptInbound: (payload: unknown) => ParsedInboundImMessage | null;
  providerEventId?: (payload: unknown) => string | undefined;
  verifyWebhook?: ChannelPlugin["verifyWebhook"];
  executeActions: ImOutboundActionExecutor;
  classifyError?: (error: unknown) => ChannelClassifiedError;
  parseDeliveryReceipts?: (payload: unknown) => ChannelDeliveryReceipt[];
};

export function createDefaultImPlugins(executeActions: ImOutboundActionExecutor): ChannelPlugin[] {
  return [
    createImChannelPlugin({
      platform: "telegram",
      adaptInbound: (payload) => adaptTelegramUpdate(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "update_id"),
      executeActions,
    }),
    createImChannelPlugin({
      platform: "slack",
      adaptInbound: (payload) => adaptSlackEvent(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "event_id"),
      executeActions,
    }),
    createImChannelPlugin({
      platform: "discord",
      adaptInbound: (payload) => adaptDiscordEvent(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "id"),
      executeActions,
    }),
    createImChannelPlugin({
      platform: "feishu",
      adaptInbound: (payload) => adaptFeishuEvent(asRecord(payload)),
      providerEventId: (payload) => nestedStringField(payload, "header", "event_id"),
      parseDeliveryReceipts: (payload) => parseFeishuDeliveryReceipts(asRecord(payload)),
      executeActions,
    }),
    createImChannelPlugin({
      platform: "dingtalk",
      adaptInbound: (payload) => adaptDingTalkRobot(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "msgId"),
      executeActions,
    }),
    createImChannelPlugin({
      platform: "whatsapp",
      adaptInbound: (payload) => adaptWhatsAppWebhook(asRecord(payload)),
      parseDeliveryReceipts: (payload) => parseWhatsAppDeliveryReceipts(asRecord(payload)),
      executeActions,
    }),
    createImChannelPlugin({
      platform: "wecom",
      adaptInbound: (payload) => adaptWeComMessage(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "MsgId") ?? stringField(payload, "msgid"),
      executeActions,
    }),
  ];
}

export function createImChannelPlugin(options: ImChannelPluginOptions): ChannelPlugin {
  const capabilities = new Set<ChannelCapability>(["text"]);
  if (["telegram", "slack", "discord", "whatsapp"].includes(options.platform)) {
    capabilities.add("attachments");
  }
  if (["telegram", "slack", "discord"].includes(options.platform)) {
    capabilities.add("threads");
  }
  if (options.parseDeliveryReceipts) capabilities.add("delivery_receipts");
  return {
    type: options.platform,
    capabilities,
    verifyWebhook: options.verifyWebhook,
    async parseWebhook(request: ChannelWebhookRequest): Promise<ChannelProviderEvent[]> {
      const payload = parseJsonBody(request.rawBody);
      const parsed = options.adaptInbound(payload);
      if (!parsed) return [];
      return [
        {
          providerEventId:
            options.providerEventId?.(payload) ??
            `${options.platform}:${parsed.channelId}:${parsed.platformMessageId}`,
          eventType: "message",
          payload,
        },
      ];
    },
    async normalizeInbound(
      event: ChannelProviderEvent,
      _connection: ChannelConnectionConfig,
    ): Promise<ChannelInboundEnvelope | null> {
      const parsed = options.adaptInbound(event.payload);
      if (!parsed) return null;
      return {
        providerEventId: event.providerEventId,
        providerMessageId: parsed.platformMessageId,
        channelType: parsed.channelType,
        externalThreadId: parsed.channelId,
        externalUserId: parsed.userId,
        plainText: parsed.plainText,
        parts: parsed.parts,
        attachments: parsed.attachments.map((attachment) => ({
          providerAttachmentId: attachment.platformRef,
          url: attachment.platformRef,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
        })),
        replyToProviderMessageId: parsed.replyToMessageId,
        attributes: {
          ...(parsed.conversationAttributes ?? {}),
          ...(parsed.mediaGroupId ? { mediaGroupId: parsed.mediaGroupId } : {}),
        },
      };
    },
    async send(envelope, connection) {
      const attachments = attachmentRefs(envelope.metadata);
      const actions = planImOutboundActions({
        platform: options.platform,
        targetId: envelope.externalThreadId,
        parts: envelope.parts,
        attachments,
        directives: envelope.directives,
        channelAttributes: {
          ...connection.settings,
          ...(envelope.metadata?.channelAttributes as Record<string, unknown> | undefined),
        },
      });
      if (actions.length === 0) throw new Error("channel_outbound_has_no_actions");
      const result = await options.executeActions(actions, connection);
      return {
        providerMessageIds: result.providerMessageIds,
        providerResponse: result.providerResponse,
        acceptedAt: new Date(),
      };
    },
    parseDeliveryReceipts: options.parseDeliveryReceipts
      ? async (request) => {
          const payload = parseJsonBody(request.rawBody);
          return options.parseDeliveryReceipts?.(payload) ?? [];
        }
      : undefined,
    classifyError: options.classifyError ?? classifyImError,
  };
}

function planImOutboundActions(input: PlanImOutboundInput): ImOutboundAction[] {
  if (input.platform === "telegram") return planTelegramOutbound(input);
  if (input.platform === "discord") return planDiscordOutbound(input);
  if (input.platform === "feishu") return planFeishuOutbound(input);
  if (input.platform === "dingtalk") return planDingTalkOutbound(input);
  if (input.platform === "whatsapp") return planWhatsAppOutbound(input);
  if (input.platform === "wecom") return planWeComOutbound(input);
  return planSlackOutbound(input);
}

function parseJsonBody(rawBody: Uint8Array): unknown {
  const text = new TextDecoder().decode(rawBody);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_channel_webhook_json");
  }
}

function attachmentRefs(
  metadata: Record<string, unknown> | undefined,
): Map<string, ImAttachmentRef> {
  const refs = new Map<string, ImAttachmentRef>();
  const raw = metadata?.attachments;
  if (!Array.isArray(raw)) return refs;
  for (const value of raw) {
    if (!isAttachmentRef(value)) continue;
    refs.set(value.attachmentId, value);
  }
  return refs;
}

function isAttachmentRef(value: unknown): value is ImAttachmentRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Partial<ImAttachmentRef>;
  return (
    typeof ref.attachmentId === "string" &&
    typeof ref.contentUrl === "string" &&
    typeof ref.contentType === "string" &&
    typeof ref.fileName === "string"
  );
}

function classifyImError(error: unknown): ChannelClassifiedError {
  const candidate = error as { status?: unknown; retryAfterMs?: unknown; message?: unknown };
  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) {
    return {
      disposition: "unknown_after_send",
      code: "unknown_after_send",
      message,
    };
  }
  if (status === 429) {
    return {
      disposition: "rate_limited",
      code: "provider_rate_limited",
      message,
      retryAfterMs: typeof candidate.retryAfterMs === "number" ? candidate.retryAfterMs : undefined,
    };
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return { disposition: "terminal", code: `provider_http_${status}`, message };
  }
  return { disposition: "retryable", code: "provider_unavailable", message };
}

function asRecord(payload: unknown): Record<string, never> {
  return payload && typeof payload === "object" ? (payload as Record<string, never>) : {};
}

function stringField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function nestedStringField(payload: unknown, parent: string, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const nested = (payload as Record<string, unknown>)[parent];
  return stringField(nested, key);
}
