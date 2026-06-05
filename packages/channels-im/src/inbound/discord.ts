import { type MessagePart, inferMessageKind } from "@keenai/shared";
import { defaultFileName, isAllowedImMime } from "../mime.js";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

type DiscordAttachment = {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  url?: string;
};

type DiscordAuthor = {
  id?: string;
  bot?: boolean;
};

type DiscordMessage = {
  id?: string;
  channel_id?: string;
  author?: DiscordAuthor;
  content?: string;
  attachments?: DiscordAttachment[];
};

export type DiscordGatewayPayload = {
  t?: string;
  d?: DiscordMessage;
  message?: DiscordMessage;
};

/** Normalize a Discord Gateway MESSAGE_CREATE (or test envelope) into KeenAI inbound IM. */
export function adaptDiscordEvent(payload: DiscordGatewayPayload): ParsedInboundImMessage | null {
  const message =
    payload.t === "MESSAGE_CREATE" ? payload.d : (payload.message ?? payload.d ?? null);
  if (!message?.id || !message.channel_id) return null;
  if (message.author?.bot) return null;

  const attachments: ImPendingAttachment[] = [];
  for (const file of message.attachments ?? []) {
    if (!file.id || !file.content_type || !isAllowedImMime(file.content_type)) continue;
    attachments.push({
      fileName: file.filename ?? defaultFileName(file.content_type, file.id),
      contentType: file.content_type,
      sizeBytes: file.size ?? 0,
      platform: "discord",
      platformRef: file.url ?? file.id,
    });
  }

  const text = message.content?.trim();
  if (attachments.length === 0 && !text) return null;

  const parts = buildInboundParts(text, attachments);

  return {
    platformMessageId: message.id,
    channelType: "discord",
    channelId: message.channel_id,
    userId: message.author?.id ?? "discord-user",
    plainText: text || summarizeMedia(attachments),
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
  };
}

function buildInboundParts(
  text: string | undefined,
  attachments: ImPendingAttachment[],
): MessagePart[] {
  const parts: MessagePart[] = [];
  if (text?.trim()) parts.push({ type: "text", text: text.trim() });

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
  if (attachments.length === 0) return "";
  const first = attachments[0];
  if (!first) return "";
  const mime = first.contentType.toLowerCase();
  if (mime.startsWith("image/")) return `[Image: ${first.fileName}]`;
  if (mime.startsWith("audio/")) return "[Voice message]";
  if (mime.startsWith("video/")) return `[Video: ${first.fileName}]`;
  return `[File: ${first.fileName}]`;
}
