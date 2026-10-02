import { type MessagePart, inferMessageKind } from "@keenai/shared";
import { defaultFileName, isAllowedImMime } from "../mime.js";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

type TelegramUser = { id?: number; username?: string; first_name?: string };
type TelegramChat = { id?: number; type?: string; title?: string; username?: string };
type TelegramFileRef = { file_id?: string; file_unique_id?: string; file_size?: number };
type TelegramPhotoSize = TelegramFileRef & { width?: number; height?: number };
type TelegramDocument = TelegramFileRef & {
  file_name?: string;
  mime_type?: string;
};
type TelegramReactionType = {
  type?: "emoji" | "custom_emoji" | "paid";
  emoji?: string;
  custom_emoji_id?: string;
};
type TelegramMessage = {
  message_id?: number;
  business_connection_id?: string;
  message_thread_id?: number;
  from?: TelegramUser;
  chat?: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  voice?: TelegramDocument;
  audio?: TelegramDocument;
  video?: TelegramDocument;
  animation?: TelegramDocument;
  video_note?: TelegramDocument;
  sticker?: TelegramDocument & { is_animated?: boolean; is_video?: boolean; emoji?: string };
  document?: TelegramDocument;
  location?: { latitude?: number; longitude?: number; horizontal_accuracy?: number };
  venue?: {
    location?: { latitude?: number; longitude?: number };
    title?: string;
    address?: string;
  };
  contact?: {
    phone_number?: string;
    first_name?: string;
    last_name?: string;
    user_id?: number;
    vcard?: string;
  };
  poll?: {
    id?: string;
    question?: string;
    options?: Array<{ text?: string; voter_count?: number }>;
    is_closed?: boolean;
  };
  dice?: { emoji?: string; value?: number };
  reply_to_message?: { message_id?: number };
  media_group_id?: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  business_message?: TelegramMessage;
  edited_business_message?: TelegramMessage;
  deleted_business_messages?: {
    business_connection_id?: string;
    chat?: TelegramChat;
    message_ids?: number[];
  };
  message_reaction?: {
    chat?: TelegramChat;
    message_id?: number;
    user?: TelegramUser;
    actor_chat?: TelegramChat;
    old_reaction?: TelegramReactionType[];
    new_reaction?: TelegramReactionType[];
  };
  callback_query?: {
    id?: string;
    from?: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
};

/** Normalize a Telegram Bot API update into a KeenAI inbound IM message. */
export function adaptTelegramUpdate(update: TelegramUpdate): ParsedInboundImMessage | null {
  const deletedBusinessMessages = update.deleted_business_messages;
  const deletedBusinessMessageId = deletedBusinessMessages?.message_ids?.[0];
  if (deletedBusinessMessages?.chat?.id && deletedBusinessMessageId) {
    const chatId = String(deletedBusinessMessages.chat.id);
    return {
      platformMessageId: String(deletedBusinessMessageId),
      channelType: "telegram",
      conversationKey: chatId,
      channelId: chatId,
      userId: "telegram-business",
      plainText: "(message deleted)",
      parts: [],
      messageKind: "text",
      attachments: [],
      mutation: {
        type: "message.deleted",
        targetProviderMessageId: String(deletedBusinessMessageId),
      },
      conversationAttributes: telegramConversationAttributes(
        deletedBusinessMessages.business_connection_id,
      ),
    };
  }
  const reaction = update.message_reaction;
  if (reaction?.chat?.id && reaction.message_id) {
    const actorId = String(
      reaction.user?.id ?? reaction.user?.username ?? reaction.actor_chat?.id ?? "telegram-user",
    );
    return {
      platformMessageId: String(reaction.message_id),
      channelType: "telegram",
      conversationKey: String(reaction.chat.id),
      channelId: String(reaction.chat.id),
      userId: actorId,
      plainText: "(reaction updated)",
      parts: [{ type: "text", text: "(reaction updated)" }],
      messageKind: "text",
      attachments: [],
      mutation: {
        type: "reactions.replaced",
        targetProviderMessageId: String(reaction.message_id),
        actorId,
        oldEmojis: telegramReactions(reaction.old_reaction),
        newEmojis: telegramReactions(reaction.new_reaction),
      },
    };
  }
  const callback = update.callback_query;
  if (callback?.id && callback.data && callback.message?.chat?.id && callback.message.message_id) {
    const chatId = String(callback.message.chat.id);
    const providerThreadId = telegramThreadId(callback.message.message_thread_id);
    return {
      platformMessageId: callback.id,
      channelType: "telegram",
      conversationKey: telegramConversationKey(chatId, providerThreadId),
      channelId: chatId,
      providerThreadId,
      userId: String(callback.from?.id ?? callback.from?.username ?? "telegram-user"),
      plainText: callback.data,
      parts: [{ type: "text", text: callback.data }],
      messageKind: "text",
      attachments: [],
      replyToMessageId: String(callback.message.message_id),
      interaction: { type: "button", id: callback.data },
    };
  }
  const message =
    update.message ??
    update.channel_post ??
    update.business_message ??
    update.edited_message ??
    update.edited_channel_post ??
    update.edited_business_message;
  const edited = Boolean(
    update.edited_message ?? update.edited_channel_post ?? update.edited_business_message,
  );
  if (!message?.chat?.id || !message.message_id) return null;

  const chatId = String(message.chat.id);
  const providerThreadId = telegramThreadId(message.message_thread_id);
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

  const animation = message.animation;
  if (animation?.file_id) {
    const mime = animation.mime_type ?? "video/mp4";
    attachments.push(
      telegramAttachment(
        mime,
        animation.file_id,
        animation.file_size,
        animation.file_name ?? (mime === "image/gif" ? "animation.gif" : "animation.mp4"),
      ),
    );
  }

  if (message.video_note?.file_id) {
    attachments.push(
      telegramAttachment(
        message.video_note.mime_type ?? "video/mp4",
        message.video_note.file_id,
        message.video_note.file_size,
        message.video_note.file_name ?? "video-note.mp4",
      ),
    );
  }

  if (message.sticker?.file_id) {
    const mime = message.sticker.is_animated
      ? "application/x-tgsticker"
      : message.sticker.is_video
        ? "video/webm"
        : (message.sticker.mime_type ?? "image/webp");
    attachments.push(
      telegramAttachment(
        mime,
        message.sticker.file_id,
        message.sticker.file_size,
        message.sticker.file_name ??
          (message.sticker.is_animated
            ? "sticker.tgs"
            : message.sticker.is_video
              ? "sticker.webm"
              : "sticker.webp"),
      ),
    );
  }

  if (
    message.document?.file_id &&
    !message.video &&
    !message.animation &&
    !message.video_note &&
    !message.sticker &&
    !message.voice &&
    !message.audio &&
    !photo
  ) {
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

  const structuredText = telegramStructuredText(message);
  if (attachments.length === 0 && !text && !structuredText) return null;

  const parts = buildInboundParts(text ?? structuredText, caption, attachments);
  const plainText = caption || text || structuredText || summarizeMedia(attachments);

  const parsed: ParsedInboundImMessage = {
    platformMessageId: String(message.message_id),
    channelType: "telegram",
    conversationKey: telegramConversationKey(chatId, providerThreadId),
    channelId: chatId,
    providerThreadId,
    userId,
    plainText: plainText.trim() || "(empty)",
    parts,
    messageKind: message.sticker ? "sticker" : inferMessageKind(parts),
    attachments,
    replyToMessageId: message.reply_to_message?.message_id
      ? String(message.reply_to_message.message_id)
      : undefined,
    mediaGroupId: message.media_group_id,
    conversationAttributes: telegramConversationAttributes(message.business_connection_id),
  };
  if (edited) {
    parsed.mutation = {
      type: "message.updated",
      targetProviderMessageId: String(message.message_id),
      replaceAttachments: telegramHasMedia(message),
    };
  }
  return parsed;
}

/** Split Telegram's batched business-delete update into one durable mutation per message. */
export function splitTelegramUpdate(update: TelegramUpdate): TelegramUpdate[] {
  const deleted = update.deleted_business_messages;
  if (!deleted?.message_ids?.length) return [update];
  return deleted.message_ids.map((messageId) => ({
    ...update,
    deleted_business_messages: { ...deleted, message_ids: [messageId] },
  }));
}

export function telegramUpdateEventId(update: TelegramUpdate): string | undefined {
  const updateId = update.update_id;
  if (!Number.isSafeInteger(updateId)) return undefined;
  const deletedMessageId = update.deleted_business_messages?.message_ids?.[0];
  return Number.isSafeInteger(deletedMessageId)
    ? `${updateId}:deleted_business_message:${deletedMessageId}`
    : String(updateId);
}

function telegramConversationAttributes(
  businessConnectionId: string | undefined,
): Record<string, unknown> | undefined {
  return businessConnectionId ? { businessConnectionId } : undefined;
}

function telegramHasMedia(message: TelegramMessage): boolean {
  return Boolean(
    message.photo ||
      message.voice ||
      message.audio ||
      message.video ||
      message.animation ||
      message.video_note ||
      message.sticker ||
      message.document,
  );
}

function telegramReactions(values: TelegramReactionType[] | undefined): string[] {
  return (values ?? []).flatMap((value) => {
    if (value.type === "emoji" && value.emoji) return [value.emoji];
    if (value.type === "custom_emoji" && value.custom_emoji_id) {
      return [`custom:${value.custom_emoji_id}`];
    }
    if (value.type === "paid") return ["⭐"];
    return [];
  });
}

function telegramStructuredText(message: TelegramMessage): string | undefined {
  if (message.venue?.location) {
    const location = message.venue.location;
    if (location.latitude === undefined || location.longitude === undefined) return undefined;
    const label = [message.venue.title, message.venue.address].filter(Boolean).join(" - ");
    return `[Venue${label ? `: ${label}` : ""} (${location.latitude}, ${location.longitude})]`;
  }
  if (message.location?.latitude !== undefined && message.location.longitude !== undefined) {
    return `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
  }
  if (message.contact?.phone_number) {
    const name = [message.contact.first_name, message.contact.last_name].filter(Boolean).join(" ");
    return `[Contact: ${name || "Contact"}, ${message.contact.phone_number}]`;
  }
  if (message.poll?.question) {
    const options = (message.poll.options ?? [])
      .flatMap((option) => (option.text ? [`- ${option.text}`] : []))
      .join("\n");
    return `[Poll: ${message.poll.question}${options ? `\n${options}` : ""}]`;
  }
  if (message.dice?.value !== undefined) {
    return `[Dice: ${message.dice.emoji ?? "🎲"} ${message.dice.value}]`;
  }
  return undefined;
}

function telegramThreadId(value: number | undefined): string | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? String(value) : undefined;
}

function telegramConversationKey(chatId: string, providerThreadId: string | undefined): string {
  return providerThreadId ? `${chatId}:topic:${providerThreadId}` : chatId;
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
