import type { ChannelDeliveryReceipt } from "@keenai/channels-core";
import { type MessagePart, inferMessageKind } from "@keenai/shared";
import { defaultFileName, isAllowedImMime } from "../mime.js";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

type WhatsAppMedia = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
};

type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: "text" | "image" | "audio" | "video" | "document" | "button" | "interactive";
  text?: { body?: string };
  image?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
  document?: WhatsAppMedia;
  context?: { id?: string };
};

type WhatsAppValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WhatsAppMessage[];
  statuses?: Array<{
    id?: string;
    status?: "sent" | "delivered" | "read" | "failed";
    timestamp?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
  }>;
};

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: WhatsAppValue;
    }[];
  }[];
};

/** Normalize the first WhatsApp Cloud API message into a KeenAI inbound IM message. */
export function adaptWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
): ParsedInboundImMessage | null {
  const value = firstMessageValue(payload);
  const message = value?.messages?.[0];
  if (!value || !message?.id || !message.from) return null;

  const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
  const text = message.text?.body?.trim();
  const media = mediaFromMessage(message);
  const caption = media?.caption?.trim();
  const attachment = media ? whatsAppAttachment(media, message.type) : null;
  const attachments = attachment ? [attachment] : [];

  if (attachments.length === 0 && !text && !caption) return null;

  const parts = buildInboundParts(text, caption, attachments);
  const plainText = caption || text || summarizeMedia(attachments);

  return {
    platformMessageId: message.id,
    channelType: "whatsapp",
    channelId: message.from,
    userId: contact?.wa_id ?? message.from,
    plainText: plainText.trim() || "(empty)",
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    replyToMessageId: message.context?.id,
    conversationAttributes: {
      ...(value.metadata?.phone_number_id
        ? { whatsappPhoneNumberId: value.metadata.phone_number_id }
        : {}),
      ...(value.metadata?.display_phone_number
        ? { whatsappDisplayPhoneNumber: value.metadata.display_phone_number }
        : {}),
      ...(contact?.profile?.name ? { profileName: contact.profile.name } : {}),
    },
  };
}

export function parseWhatsAppDeliveryReceipts(
  payload: WhatsAppWebhookPayload,
): ChannelDeliveryReceipt[] {
  const receipts: ChannelDeliveryReceipt[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const error = status.errors?.[0];
        receipts.push({
          providerMessageId: status.id,
          status: status.status,
          occurredAt: status.timestamp ? new Date(Number(status.timestamp) * 1_000) : new Date(),
          errorCode: error?.code === undefined ? undefined : String(error.code),
          errorMessage: error?.message ?? error?.title,
          payload: status,
        });
      }
    }
  }
  return receipts;
}

function firstMessageValue(payload: WhatsAppWebhookPayload): WhatsAppValue | undefined {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.value?.messages?.length) return change.value;
    }
  }
  return undefined;
}

function mediaFromMessage(message: WhatsAppMessage): WhatsAppMedia | null {
  if (message.image?.id) return message.image;
  if (message.audio?.id) return message.audio;
  if (message.video?.id) return message.video;
  if (message.document?.id) return message.document;
  return null;
}

function whatsAppAttachment(
  media: WhatsAppMedia,
  messageType: WhatsAppMessage["type"],
): ImPendingAttachment | null {
  const contentType = media.mime_type ?? fallbackMime(messageType);
  const platformRef = media.id ?? media.sha256 ?? "whatsapp-media";
  if (!isAllowedImMime(contentType)) return null;
  return {
    fileName: media.filename ?? defaultFileName(contentType, platformRef),
    contentType,
    sizeBytes: 0,
    platform: "whatsapp",
    platformRef,
  };
}

function fallbackMime(messageType: WhatsAppMessage["type"]): string {
  if (messageType === "image") return "image/jpeg";
  if (messageType === "audio") return "audio/ogg";
  if (messageType === "video") return "video/mp4";
  return "application/octet-stream";
}

function buildInboundParts(
  text: string | undefined,
  caption: string | undefined,
  attachments: ImPendingAttachment[],
): MessagePart[] {
  const parts: MessagePart[] = [];
  const leadingText = text?.trim() || caption?.trim();
  if (leadingText) parts.push({ type: "text", text: leadingText });

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    if (!att) continue;
    const attachmentId = `pending-${i}`;
    const mime = att.contentType.toLowerCase();
    if (mime.startsWith("image/")) {
      parts.push({ type: "image", attachmentId });
    } else if (mime.startsWith("audio/")) {
      parts.push({ type: "audio", attachmentId });
    } else if (mime.startsWith("video/")) {
      parts.push({ type: "video", attachmentId });
    } else {
      parts.push({ type: "file", attachmentId, fileName: att.fileName });
    }
  }

  return parts;
}

function summarizeMedia(attachments: ImPendingAttachment[]): string {
  const first = attachments[0];
  if (!first) return "";
  const mime = first.contentType.toLowerCase();
  if (mime.startsWith("image/")) return `[Image: ${first.fileName}]`;
  if (mime.startsWith("audio/")) return "[Voice message]";
  if (mime.startsWith("video/")) return `[Video: ${first.fileName}]`;
  return `[File: ${first.fileName}]`;
}
