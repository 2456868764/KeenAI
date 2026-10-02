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
  type?:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "contacts"
    | "reaction"
    | "button"
    | "interactive";
  text?: { body?: string };
  image?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
  document?: WhatsAppMedia;
  sticker?: WhatsAppMedia;
  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{
    name?: { formatted_name?: string };
    phones?: Array<{ phone?: string; wa_id?: string }>;
    emails?: Array<{ email?: string }>;
  }>;
  reaction?: { message_id?: string; emoji?: string };
  context?: { id?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type?: "button_reply" | "list_reply";
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
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

/** Split a Meta webhook batch so every message receives its own durable ingress identity. */
export function splitWhatsAppMessageWebhooks(
  payload: WhatsAppWebhookPayload,
): WhatsAppWebhookPayload[] {
  const events: WhatsAppWebhookPayload[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      for (const message of value.messages ?? []) {
        events.push({
          object: payload.object,
          entry: [
            {
              id: entry.id,
              changes: [
                {
                  field: change.field,
                  value: { ...value, messages: [message], statuses: undefined },
                },
              ],
            },
          ],
        });
      }
    }
  }
  return events;
}

/** Normalize one WhatsApp Cloud API message into a KeenAI inbound IM message. */
export function adaptWhatsAppWebhook(
  payload: WhatsAppWebhookPayload,
): ParsedInboundImMessage | null {
  const value = firstMessageValue(payload);
  const message = value?.messages?.[0];
  if (!value || !message?.id || !message.from) return null;

  const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
  if (message.type === "reaction" && message.reaction?.message_id) {
    const emoji = message.reaction.emoji?.trim() ?? "";
    return {
      platformMessageId: message.reaction.message_id,
      channelType: "whatsapp",
      channelId: message.from,
      userId: contact?.wa_id ?? message.from,
      plainText: emoji || "(reaction removed)",
      parts: emoji ? [{ type: "text", text: emoji }] : [],
      messageKind: "text",
      attachments: [],
      mutation: {
        type: emoji ? "reaction.added" : "reaction.removed",
        targetProviderMessageId: message.reaction.message_id,
        actorId: contact?.wa_id ?? message.from,
        emoji: emoji || "*",
      },
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
  const text = message.text?.body?.trim();
  const structuredText = whatsAppStructuredText(message);
  const interaction = whatsAppInteraction(message);
  const media = mediaFromMessage(message);
  const caption = media?.caption?.trim();
  const attachment = media ? whatsAppAttachment(media, message.type) : null;
  const attachments = attachment ? [attachment] : [];

  if (attachments.length === 0 && !text && !structuredText && !caption && !interaction) return null;

  const parts = buildInboundParts(text ?? structuredText, caption, attachments);
  const plainText =
    interaction?.label || caption || text || structuredText || summarizeMedia(attachments);

  return {
    platformMessageId: message.id,
    channelType: "whatsapp",
    channelId: message.from,
    userId: contact?.wa_id ?? message.from,
    plainText: plainText.trim() || "(empty)",
    parts: interaction ? [{ type: "text", text: interaction.label }] : parts,
    messageKind: message.type === "sticker" ? "sticker" : inferMessageKind(parts),
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
    interaction: interaction ? { type: "button", id: interaction.id } : undefined,
  };
}

function whatsAppInteraction(message: WhatsAppMessage): { id: string; label: string } | null {
  const button = message.interactive?.button_reply ?? message.interactive?.list_reply;
  if (button?.id) return { id: button.id, label: button.title?.trim() || button.id };
  if (message.button?.payload) {
    return {
      id: message.button.payload,
      label: message.button.text?.trim() || message.button.payload,
    };
  }
  return null;
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
  if (message.sticker?.id) return message.sticker;
  return null;
}

function whatsAppStructuredText(message: WhatsAppMessage): string | undefined {
  if (message.type === "location" && message.location) {
    const { latitude, longitude, name, address } = message.location;
    if (latitude === undefined || longitude === undefined) return undefined;
    const label = [name, address].filter(Boolean).join(" - ");
    return `[Location${label ? `: ${label}` : ""} (${latitude}, ${longitude})]`;
  }
  if (message.type === "contacts" && message.contacts?.length) {
    return message.contacts
      .map((contact) => {
        const name = contact.name?.formatted_name ?? "Contact";
        const phones = (contact.phones ?? [])
          .map((phone) => phone.phone ?? phone.wa_id)
          .filter((value): value is string => Boolean(value));
        const emails = (contact.emails ?? [])
          .map((email) => email.email)
          .filter((value): value is string => Boolean(value));
        return `[Contact: ${[name, ...phones, ...emails].join(", ")}]`;
      })
      .join("\n");
  }
  return undefined;
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
  if (messageType === "sticker") return "image/webp";
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
