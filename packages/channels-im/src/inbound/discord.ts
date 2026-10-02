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
  guild_id?: string;
  channel_id?: string;
  author?: DiscordAuthor;
  content?: string;
  attachments?: DiscordAttachment[];
  message_reference?: { message_id?: string };
};

type DiscordMessageDelete = {
  id?: string;
  guild_id?: string;
  channel_id?: string;
};

type DiscordReaction = {
  message_id?: string;
  guild_id?: string;
  channel_id?: string;
  user_id?: string;
  member?: { user?: DiscordAuthor };
  emoji?: { id?: string; name?: string };
};

type DiscordInteraction = {
  id?: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: DiscordAuthor };
  user?: DiscordAuthor;
  data?: { custom_id?: string };
  message?: { id?: string };
};

export type DiscordGatewayPayload = {
  type?: number;
  id?: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: DiscordAuthor };
  user?: DiscordAuthor;
  data?: { custom_id?: string };
  token?: string;
  t?: string;
  s?: number;
  d?: DiscordMessage | DiscordInteraction | DiscordMessageDelete | DiscordReaction;
  message?: DiscordMessage | { id?: string };
};

/** Normalize a Discord Gateway MESSAGE_CREATE (or test envelope) into KeenAI inbound IM. */
export function adaptDiscordEvent(payload: DiscordGatewayPayload): ParsedInboundImMessage | null {
  if (payload.t === "INTERACTION_CREATE" || payload.type === 3) {
    const interaction =
      payload.type === 3 ? (payload as DiscordInteraction) : (payload.d as DiscordInteraction);
    const buttonId = interaction?.data?.custom_id;
    if (!interaction?.id || !interaction.channel_id || !buttonId) return null;
    const author = interaction.member?.user ?? interaction.user;
    return {
      platformMessageId: interaction.id,
      channelType: "discord",
      channelId: interaction.channel_id,
      userId: author?.id ?? "discord-user",
      plainText: buttonId,
      parts: [{ type: "text", text: buttonId }],
      messageKind: "text",
      attachments: [],
      replyToMessageId: interaction.message?.id,
      interaction: { type: "button", id: buttonId },
      conversationAttributes: interaction.guild_id ? { guildId: interaction.guild_id } : undefined,
    };
  }
  if (payload.t === "MESSAGE_DELETE") {
    const deleted = payload.d as DiscordMessageDelete;
    if (!deleted?.id || !deleted.channel_id) return null;
    return {
      platformMessageId: deleted.id,
      channelType: "discord",
      channelId: deleted.channel_id,
      userId: "discord-user",
      plainText: "(message deleted)",
      parts: [],
      messageKind: "text",
      attachments: [],
      mutation: { type: "message.deleted", targetProviderMessageId: deleted.id },
      conversationAttributes: deleted.guild_id ? { guildId: deleted.guild_id } : undefined,
    };
  }
  if (payload.t === "MESSAGE_REACTION_ADD" || payload.t === "MESSAGE_REACTION_REMOVE") {
    const reaction = payload.d as DiscordReaction;
    const emoji = discordEmoji(reaction?.emoji);
    const actorId = reaction?.user_id ?? reaction?.member?.user?.id;
    if (!reaction?.message_id || !reaction.channel_id || !emoji || !actorId) return null;
    return {
      platformMessageId: reaction.message_id,
      channelType: "discord",
      channelId: reaction.channel_id,
      userId: actorId,
      plainText: emoji,
      parts: [{ type: "text", text: emoji }],
      messageKind: "text",
      attachments: [],
      mutation: {
        type: payload.t === "MESSAGE_REACTION_ADD" ? "reaction.added" : "reaction.removed",
        targetProviderMessageId: reaction.message_id,
        actorId,
        emoji,
      },
      conversationAttributes: reaction.guild_id ? { guildId: reaction.guild_id } : undefined,
    };
  }
  const message =
    payload.t === "MESSAGE_CREATE" || payload.t === "MESSAGE_UPDATE"
      ? (payload.d as DiscordMessage | undefined)
      : ((payload.message as DiscordMessage | undefined) ??
        (payload.d as DiscordMessage | undefined) ??
        null);
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
  if (attachments.length === 0 && text === undefined) return null;

  const parts = buildInboundParts(text, attachments);

  const parsed: ParsedInboundImMessage = {
    platformMessageId: message.id,
    channelType: "discord",
    channelId: message.channel_id,
    userId: message.author?.id ?? "discord-user",
    plainText: text || summarizeMedia(attachments),
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    replyToMessageId: message.message_reference?.message_id,
    conversationAttributes: message.guild_id ? { guildId: message.guild_id } : undefined,
  };
  if (payload.t === "MESSAGE_UPDATE") {
    parsed.mutation = {
      type: "message.updated",
      targetProviderMessageId: message.id,
      replaceAttachments: Array.isArray(message.attachments),
    };
  }
  return parsed;
}

function discordEmoji(value: DiscordReaction["emoji"]): string | null {
  if (!value?.name) return null;
  return value.id ? `<:${value.name}:${value.id}>` : value.name;
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
