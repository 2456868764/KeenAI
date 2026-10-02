import type { ChannelDeliveryReceipt } from "@keenai/channels-core";
import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

type FeishuHeader = {
  event_type?: string;
  event_id?: string;
};

type FeishuMessage = {
  message_id?: string;
  chat_id?: string;
  chat_type?: string;
  root_id?: string;
  parent_id?: string;
  message_type?: string;
  content?: string;
};

type FeishuEvent = {
  sender?: { sender_id?: { open_id?: string; user_id?: string } };
  message?: FeishuMessage;
  message_id_list?: string[];
  read_time?: string;
  reader?: {
    read_time?: string;
    reader_id?: { open_id?: string; user_id?: string; union_id?: string };
  };
  open_message_id?: string;
  open_chat_id?: string;
  context?: { open_message_id?: string; open_chat_id?: string };
  operator?: { operator_id?: { open_id?: string; user_id?: string } };
  message_id?: string;
  reaction_type?: { emoji_type?: string };
  user_id?: { open_id?: string; user_id?: string };
  action?: { value?: Record<string, unknown> };
};

export type FeishuEventPayload = {
  schema?: string;
  type?: string;
  challenge?: string;
  header?: FeishuHeader;
  event?: FeishuEvent;
};

export function feishuUrlVerificationChallenge(payload: FeishuEventPayload): string | null {
  if (payload.type === "url_verification" && payload.challenge) return payload.challenge;
  if (payload.header?.event_type === "url_verification" && payload.challenge) {
    return payload.challenge;
  }
  return null;
}

/** Normalize a Feishu/Lark event callback into a KeenAI inbound IM message. */
export function adaptFeishuEvent(payload: FeishuEventPayload): ParsedInboundImMessage | null {
  const eventType = payload.header?.event_type ?? payload.type;
  if (
    eventType === "im.message.reaction.created_v1" ||
    eventType === "im.message.reaction.deleted_v1"
  ) {
    const messageId = payload.event?.message_id;
    const emoji = payload.event?.reaction_type?.emoji_type;
    const actorId =
      payload.event?.user_id?.open_id ?? payload.event?.user_id?.user_id ?? "feishu-user";
    if (!messageId || !emoji) return null;
    return {
      platformMessageId: messageId,
      channelType: "feishu",
      channelId: "unknown",
      userId: actorId,
      plainText: emoji,
      parts: [{ type: "text", text: emoji }],
      messageKind: "text",
      attachments: [],
      mutation: {
        type:
          eventType === "im.message.reaction.created_v1" ? "reaction.added" : "reaction.removed",
        targetProviderMessageId: messageId,
        actorId,
        emoji,
      },
    };
  }
  if (eventType === "im.message.recalled_v1") {
    const messageId = payload.event?.message_id;
    if (!messageId) return null;
    return {
      platformMessageId: messageId,
      channelType: "feishu",
      channelId: "unknown",
      userId: "feishu-user",
      plainText: "(message deleted)",
      parts: [],
      messageKind: "text",
      attachments: [],
      mutation: { type: "message.deleted", targetProviderMessageId: messageId },
    };
  }
  if (eventType === "card.action.trigger") {
    const buttonId = payload.event?.action?.value?.keenai_button_id;
    const messageId = payload.event?.context?.open_message_id ?? payload.event?.open_message_id;
    const chatId = payload.event?.context?.open_chat_id ?? payload.event?.open_chat_id;
    if (typeof buttonId !== "string" || !buttonId || !messageId || !chatId) return null;
    const userId =
      payload.event?.operator?.operator_id?.open_id ??
      payload.event?.operator?.operator_id?.user_id ??
      "feishu-user";
    return {
      platformMessageId: payload.header?.event_id ?? `interaction:${messageId}:${buttonId}`,
      channelType: "feishu",
      channelId: chatId,
      userId,
      plainText: buttonId,
      parts: [{ type: "text", text: buttonId }],
      messageKind: "text",
      attachments: [],
      replyToMessageId: messageId,
      interaction: { type: "button", id: buttonId },
    };
  }
  if (eventType !== "im.message.receive_v1") return null;

  const message = payload.event?.message;
  if (!message?.message_id || !message.chat_id) return null;
  if (!message.message_type || !message.content) return null;

  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse(message.content) as Record<string, unknown>;
  } catch {
    if (message.message_type === "text") content = { text: message.content };
  }
  const text =
    typeof content.text === "string"
      ? content.text.trim()
      : message.message_type === "post"
        ? feishuPostText(content)
        : "";
  const attachments = feishuAttachments(message, content);
  if (!text && attachments.length === 0) return null;

  const senderId =
    payload.event?.sender?.sender_id?.open_id ??
    payload.event?.sender?.sender_id?.user_id ??
    "feishu-user";

  const parts: MessagePart[] = [];
  if (text) parts.push({ type: "text", text });
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (attachment) parts.push(feishuAttachmentPart(attachment, message.message_type, index));
  }
  const isDirectMessage = message.chat_type === "p2p";
  const threadRoot = message.root_id ?? message.message_id;

  return {
    platformMessageId: message.message_id,
    channelType: "feishu",
    conversationKey: isDirectMessage ? message.chat_id : `${message.chat_id}:${threadRoot}`,
    channelId: message.chat_id,
    providerThreadId: isDirectMessage ? undefined : threadRoot,
    userId: senderId,
    plainText: text || feishuAttachmentSummary(attachments[0] ?? null),
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    replyToMessageId: message.parent_id ?? message.root_id,
  };
}

function feishuAttachments(
  message: FeishuMessage,
  content: Record<string, unknown>,
): ImPendingAttachment[] {
  const messageType = message.message_type;
  if (messageType === "post") {
    return feishuPostImageKeys(content).map((resourceKey) => ({
      fileName: `${resourceKey}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 0,
      platform: "feishu" as const,
      platformRef: JSON.stringify({
        messageId: message.message_id,
        resourceKey,
        resourceType: "image",
      }),
    }));
  }
  const resourceKey =
    messageType === "image"
      ? content.image_key
      : messageType === "file" || messageType === "audio" || messageType === "media"
        ? content.file_key
        : undefined;
  if (typeof resourceKey !== "string" || !resourceKey) return [];
  const fileName =
    typeof content.file_name === "string"
      ? content.file_name
      : messageType === "image"
        ? `${resourceKey}.jpg`
        : messageType === "audio"
          ? `${resourceKey}.ogg`
          : messageType === "media"
            ? `${resourceKey}.mp4`
            : resourceKey;
  const contentType =
    messageType === "image"
      ? "image/jpeg"
      : messageType === "audio"
        ? "audio/ogg"
        : messageType === "media"
          ? "video/mp4"
          : "application/octet-stream";
  return [
    {
      fileName,
      contentType,
      sizeBytes: 0,
      platform: "feishu",
      platformRef: JSON.stringify({
        messageId: message.message_id,
        resourceKey,
        resourceType: messageType === "image" ? "image" : "file",
      }),
    },
  ];
}

function feishuAttachmentPart(
  attachment: ImPendingAttachment,
  messageType: string | undefined,
  index: number,
): MessagePart {
  const attachmentId = `pending-${index}`;
  if (messageType === "image" || messageType === "post") return { type: "image", attachmentId };
  if (messageType === "audio") return { type: "audio", attachmentId };
  if (messageType === "media") return { type: "video", attachmentId };
  return { type: "file", attachmentId, fileName: attachment.fileName };
}

function feishuPostRoot(content: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(content.content) || typeof content.title === "string") return content;
  for (const value of Object.values(content)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as Record<string, unknown>;
      if (Array.isArray(candidate.content) || typeof candidate.title === "string") return candidate;
    }
  }
  return content;
}

function feishuPostText(content: Record<string, unknown>): string {
  const root = feishuPostRoot(content);
  const lines: string[] = [];
  if (typeof root.title === "string" && root.title.trim()) lines.push(root.title.trim());
  for (const paragraph of Array.isArray(root.content) ? root.content : []) {
    if (!Array.isArray(paragraph)) continue;
    const line = paragraph
      .flatMap((node) => {
        if (!node || typeof node !== "object" || Array.isArray(node)) return [];
        const value = node as Record<string, unknown>;
        if (typeof value.text === "string") return [value.text];
        if (value.tag === "at" && typeof value.user_name === "string") {
          return [`@${value.user_name}`];
        }
        if (value.tag === "emotion" && typeof value.emoji_type === "string") {
          return [`:${value.emoji_type}:`];
        }
        return [];
      })
      .join("")
      .trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

function feishuPostImageKeys(content: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.tag === "img" && typeof record.image_key === "string" && record.image_key) {
      keys.add(record.image_key);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(feishuPostRoot(content));
  return [...keys];
}

function feishuAttachmentSummary(attachment: ImPendingAttachment | null): string {
  if (!attachment) return "";
  if (attachment.contentType.startsWith("image/")) return `[Image: ${attachment.fileName}]`;
  if (attachment.contentType.startsWith("audio/")) return "[Voice message]";
  if (attachment.contentType.startsWith("video/")) return `[Video: ${attachment.fileName}]`;
  return `[File: ${attachment.fileName}]`;
}

export function parseFeishuDeliveryReceipts(payload: FeishuEventPayload): ChannelDeliveryReceipt[] {
  if (payload.header?.event_type !== "im.message.message_read_v1") return [];
  const occurredAt =
    parseFeishuTimestamp(payload.event?.reader?.read_time ?? payload.event?.read_time) ??
    new Date();
  return (payload.event?.message_id_list ?? []).map((providerMessageId) => ({
    providerMessageId,
    status: "read",
    occurredAt,
    payload,
  }));
}

function parseFeishuTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const date = new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
