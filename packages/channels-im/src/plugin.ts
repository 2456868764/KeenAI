import type {
  ChannelCapability,
  ChannelClassifiedError,
  ChannelConnectionConfig,
  ChannelDeliveryReceipt,
  ChannelInboundEnvelope,
  ChannelMessageOperation,
  ChannelMessageOperationResult,
  ChannelPlugin,
  ChannelProviderEvent,
  ChannelProviderMessageRef,
  ChannelWebhookRequest,
} from "@keenai/channels-core";
import { adaptDingTalkRobot } from "./inbound/dingtalk.js";
import { adaptDiscordEvent } from "./inbound/discord.js";
import { adaptFeishuEvent, parseFeishuDeliveryReceipts } from "./inbound/feishu.js";
import { adaptSlackEvent } from "./inbound/slack.js";
import {
  adaptTelegramUpdate,
  splitTelegramUpdate,
  telegramUpdateEventId,
} from "./inbound/telegram.js";
import { adaptWeChatMessage } from "./inbound/wechat.js";
import { adaptWeComMessage } from "./inbound/wecom.js";
import {
  type WhatsAppWebhookPayload,
  adaptWhatsAppWebhook,
  parseWhatsAppDeliveryReceipts,
  splitWhatsAppMessageWebhooks,
} from "./inbound/whatsapp.js";
import { planDingTalkOutbound } from "./outbound/dingtalk.js";
import { planDiscordOutbound } from "./outbound/discord.js";
import { planFeishuOutbound } from "./outbound/feishu.js";
import { getImOutboundLimits } from "./outbound/limits.js";
import { planSlackOutbound } from "./outbound/slack.js";
import { planTelegramOutbound } from "./outbound/telegram.js";
import { planWeChatOutbound } from "./outbound/wechat.js";
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
) => Promise<{
  providerMessageIds: string[];
  providerMessageRefs?: ChannelProviderMessageRef[];
  providerResponse?: unknown;
}>;

export type ImMessageOperationExecutor = (
  operation: ChannelMessageOperation,
  connection: ChannelConnectionConfig,
) => Promise<ChannelMessageOperationResult>;

export type ImChannelPluginOptions = {
  platform: ImPlatform;
  adaptInbound: (payload: unknown) => ParsedInboundImMessage | null;
  providerEventId?: (payload: unknown) => string | undefined;
  expandWebhookPayload?: (payload: unknown) => unknown[];
  verifyWebhook?: ChannelPlugin["verifyWebhook"];
  executeActions: ImOutboundActionExecutor;
  executeMessageOperation?: ImMessageOperationExecutor;
  classifyError?: (error: unknown) => ChannelClassifiedError;
  parseDeliveryReceipts?: (payload: unknown) => ChannelDeliveryReceipt[];
};

export function createDefaultImPlugins(
  executeActions: ImOutboundActionExecutor,
  executeMessageOperation?: ImMessageOperationExecutor,
): ChannelPlugin[] {
  return [
    createImChannelPlugin({
      platform: "telegram",
      adaptInbound: (payload) => adaptTelegramUpdate(asRecord(payload)),
      providerEventId: (payload) => telegramUpdateEventId(asRecord(payload)),
      expandWebhookPayload: (payload) => splitTelegramUpdate(asRecord(payload)),
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "slack",
      adaptInbound: (payload) => adaptSlackEvent(asRecord(payload)),
      providerEventId: (payload) =>
        stringField(payload, "event_id") ?? stringField(payload, "trigger_id"),
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "discord",
      adaptInbound: (payload) => adaptDiscordEvent(asRecord(payload)),
      providerEventId: discordProviderEventId,
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "feishu",
      adaptInbound: (payload) => adaptFeishuEvent(asRecord(payload)),
      providerEventId: (payload) => nestedStringField(payload, "header", "event_id"),
      parseDeliveryReceipts: (payload) => parseFeishuDeliveryReceipts(asRecord(payload)),
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "dingtalk",
      adaptInbound: (payload) => adaptDingTalkRobot(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "msgId"),
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "whatsapp",
      adaptInbound: (payload) => adaptWhatsAppWebhook(asRecord(payload)),
      providerEventId: whatsAppProviderEventId,
      expandWebhookPayload: (payload) =>
        splitWhatsAppMessageWebhooks(asRecord(payload) as WhatsAppWebhookPayload),
      parseDeliveryReceipts: (payload) => parseWhatsAppDeliveryReceipts(asRecord(payload)),
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "wechat",
      adaptInbound: (payload) => adaptWeChatMessage(asRecord(payload)),
      providerEventId: (payload) =>
        stringField(payload, "MsgId") ??
        `${stringField(payload, "FromUserName") ?? "unknown"}:${stringField(payload, "CreateTime") ?? "0"}:${stringField(payload, "Event") ?? "message"}:${stringField(payload, "EventKey") ?? ""}`,
      executeActions,
      executeMessageOperation,
    }),
    createImChannelPlugin({
      platform: "wecom",
      adaptInbound: (payload) => adaptWeComMessage(asRecord(payload)),
      providerEventId: (payload) => stringField(payload, "MsgId") ?? stringField(payload, "msgid"),
      executeActions,
      executeMessageOperation,
    }),
  ];
}

export function createImChannelPlugin(options: ImChannelPluginOptions): ChannelPlugin {
  const capabilities = new Set<ChannelCapability>(["text"]);
  if (["slack", "discord"].includes(options.platform)) capabilities.add("markdown");
  if (
    ["telegram", "slack", "discord", "whatsapp", "feishu", "dingtalk", "wechat", "wecom"].includes(
      options.platform,
    )
  ) {
    capabilities.add("attachments");
  }
  if (["telegram", "slack", "discord", "feishu", "whatsapp"].includes(options.platform)) {
    capabilities.add("threads");
  }
  capabilities.add("interactive");
  if (options.platform === "whatsapp") capabilities.add("templates");
  if (options.executeMessageOperation) {
    if (["telegram", "slack", "discord", "whatsapp", "feishu"].includes(options.platform)) {
      capabilities.add("reactions");
    }
    if (["telegram", "discord", "whatsapp"].includes(options.platform)) {
      capabilities.add("typing");
    }
    if (["telegram", "slack", "discord", "feishu"].includes(options.platform)) {
      capabilities.add("message_edit");
    }
    if (
      ["telegram", "slack", "discord", "feishu", "dingtalk", "wecom"].includes(options.platform)
    ) {
      capabilities.add("message_delete");
    }
  }
  if (options.parseDeliveryReceipts) {
    capabilities.add("delivery_receipts");
    if (["feishu", "whatsapp"].includes(options.platform)) {
      capabilities.add("read_receipts");
    }
  }
  return {
    type: options.platform,
    capabilities,
    outboundLimits: getImOutboundLimits(options.platform),
    verifyWebhook: options.verifyWebhook,
    async parseWebhook(request: ChannelWebhookRequest): Promise<ChannelProviderEvent[]> {
      const payload = parseJsonBody(request.rawBody);
      const providerPayloads = options.expandWebhookPayload?.(payload) ?? [payload];
      return providerPayloads.flatMap((providerPayload) => {
        const parsed = options.adaptInbound(providerPayload);
        if (!parsed) return [];
        return [
          {
            providerEventId:
              options.providerEventId?.(providerPayload) ??
              `${options.platform}:${parsed.channelId}:${parsed.platformMessageId}`,
            eventType: parsed.mutation?.type ?? "message",
            payload: providerPayload,
          },
        ];
      });
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
        externalThreadId: parsed.conversationKey ?? parsed.channelId,
        externalTargetId: parsed.channelId,
        threadRootProviderMessageId: parsed.providerThreadId,
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
        mutation: parsed.mutation,
        attributes: {
          ...(parsed.conversationAttributes ?? {}),
          ...(parsed.mediaGroupId ? { mediaGroupId: parsed.mediaGroupId } : {}),
          ...(parsed.interaction ? { interaction: parsed.interaction } : {}),
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
        replyToMessageId: envelope.replyToProviderMessageId,
        channelAttributes: {
          ...connection.settings,
          ...(envelope.metadata?.channelAttributes as Record<string, unknown> | undefined),
        },
      });
      if (actions.length === 0) throw new Error("channel_outbound_has_no_actions");
      const result = await options.executeActions(actions, connection);
      return {
        providerMessageIds: result.providerMessageIds,
        providerMessageRefs: result.providerMessageRefs,
        providerResponse: result.providerResponse,
        acceptedAt: new Date(),
      };
    },
    executeMessageOperation: options.executeMessageOperation
      ? async (operation, connection) => {
          const capability = operationCapability(operation.type);
          if (!capabilities.has(capability)) {
            throw new Error(
              `${options.platform}_${operation.type.replace(".", "_")}_not_supported`,
            );
          }
          return options.executeMessageOperation?.(
            operation,
            connection,
          ) as Promise<ChannelMessageOperationResult>;
        }
      : undefined,
    parseDeliveryReceipts: options.parseDeliveryReceipts
      ? async (request) => {
          const payload = parseJsonBody(request.rawBody);
          return options.parseDeliveryReceipts?.(payload) ?? [];
        }
      : undefined,
    classifyError: options.classifyError ?? classifyImError,
  };
}

function operationCapability(type: ChannelMessageOperation["type"]): ChannelCapability {
  if (type === "typing") return "typing";
  if (type === "reaction.add" || type === "reaction.remove") return "reactions";
  if (type === "edit") return "message_edit";
  return "message_delete";
}

function planImOutboundActions(input: PlanImOutboundInput): ImOutboundAction[] {
  if (input.platform === "telegram") return planTelegramOutbound(input);
  if (input.platform === "discord") return planDiscordOutbound(input);
  if (input.platform === "feishu") return planFeishuOutbound(input);
  if (input.platform === "dingtalk") return planDingTalkOutbound(input);
  if (input.platform === "whatsapp") return planWhatsAppOutbound(input);
  if (input.platform === "wechat") return planWeChatOutbound(input);
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
  const candidate = error as {
    status?: unknown;
    retryAfterMs?: unknown;
    message?: unknown;
    partialDelivery?: unknown;
  };
  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (candidate?.partialDelivery === true) {
    return {
      disposition: "unknown_after_send",
      code: "partial_delivery",
      message,
    };
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  ) {
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

function discordProviderEventId(payload: unknown): string | undefined {
  const direct = stringField(payload, "id");
  if (direct) return direct;
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const eventType = stringField(record, "t");
  const sequence = stringField(record, "s");
  const data = record.d;
  const target = stringField(data, "id") ?? stringField(data, "message_id");
  return eventType && (sequence || target)
    ? `discord:${eventType}:${sequence ?? target}`
    : undefined;
}

function whatsAppProviderEventId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return undefined;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const messages = (value as { messages?: unknown }).messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const id = stringField(message, "id");
        if (id) return id;
      }
    }
  }
  return undefined;
}
