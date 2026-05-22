import { type MessagePart, inferMessageKind } from "@keenai/shared";
import { defaultFileName, isAllowedImMime } from "../mime.js";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

type TelegramUser = { id?: number; username?: string; first_name?: string };
type TelegramChat = { id?: number; type?: string };
type TelegramFileRef = { file_id?: string; file_unique_id?: string; file_size?: number };
type TelegramPhotoSize = TelegramFileRef & { width?: number; height?: number };
type TelegramDocument = TelegramFileRef & {
  file_name?: string;
  mime_type?: string;
};
type TelegramMessage = {
  message_id?: number;
  from?: TelegramUser;
  chat?: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  voice?: TelegramDocument;
  audio?: TelegramDocument;
  video?: TelegramDocument;
  document?: TelegramDocument;
  reply_to_message?: { message_id?: number };
  media_group_id?: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

/** Normalize a Telegram Bot API update into a KeenAI inbound IM message. */
export function adaptTelegramUpdate(update: TelegramUpdate): ParsedInboundImMessage | null {
  const message = update.message ?? update.edited_message;
  if (!message?.chat?.id || !message.message_id) return null;

  const chatId = String(message.chat.id);
  const userId = String(message.from?.id ?? message.from?.username ?? "telegram-user");
  const caption = message.caption?.trim();
  const text = message.text?.trim();
  const attachments: ImPendingAttachment[] = [];

  const photo = pickLargestPhoto(message.photo);
  if (photo?.file_id) {
    attachments.push(telegramAttachment("image/jpeg", photo.file_id, photo.file_size, "photo.jpg"));
  }

  const voice = message.voice ?? message.audio;
  if (voice?.file_id) {
    const mime = voice.mime_type ?? (message.voice ? "audio/ogg" : "audio/mpeg");
    attachments.push(
      telegramAttachment(
        mime,
        voice.file_id,
        voice.file_size,
        voice.file_name ?? (message.voice ? "voice.ogg" : "audio.mp3"),
      ),
    );
  }

  if (message.video?.file_id) {
    const mime = message.video.mime_type ?? "video/mp4";
    attachments.push(
      telegramAttachment(
        mime,
        message.video.file_id,
        message.video.file_size,
        message.video.file_name ?? "video.mp4",
      ),
    );
  }

  if (message.document?.file_id && !message.video && !message.voice && !message.audio && !photo) {
    const mime = message.document.mime_type ?? "application/octet-stream";
    if (isAllowedImMime(mime)) {
      attachments.push(
        telegramAttachment(
          mime,
          message.document.file_id,
          message.document.file_size,
          message.document.file_name ?? defaultFileName(mime, message.document.file_id),
        ),
      );
    }
  }

  if (attachments.length === 0 && !text) return null;

  const parts = buildInboundParts(text, caption, attachments);
  const plainText = caption || text || summarizeMedia(attachments);

  return {
    platformMessageId: String(message.message_id),
    channelType: "telegram",
    channelId: chatId,
    userId,
    plainText: plainText.trim() || "(empty)",
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    replyToMessageId: message.reply_to_message?.message_id
      ? String(message.reply_to_message.message_id)
      : undefined,
    mediaGroupId: message.media_group_id,
  };
}

function pickLargestPhoto(sizes: TelegramPhotoSize[] | undefined): TelegramPhotoSize | undefined {
  if (!sizes?.length) return undefined;
  return sizes.reduce((best, cur) => {
    const bestSize = best.file_size ?? best.width ?? 0;
    const curSize = cur.file_size ?? cur.width ?? 0;
    return curSize >= bestSize ? cur : best;
  });
}

function telegramAttachment(
  contentType: string,
  fileId: string,
  sizeBytes: number | undefined,
  fileName: string,
): ImPendingAttachment {
  return {
    fileName,
    contentType,
    sizeBytes: sizeBytes ?? 0,
    platform: "telegram",
    platformRef: fileId,
  };
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
  if (attachments.length === 0) return "";
  const first = attachments[0];
  if (!first) return "";
  const mime = first.contentType.toLowerCase();
  if (mime.startsWith("image/")) return `[Image: ${first.fileName}]`;
  if (mime.startsWith("audio/")) return "[Voice message]";
  if (mime.startsWith("video/")) return `[Video: ${first.fileName}]`;
  return `[File: ${first.fileName}]`;
}
