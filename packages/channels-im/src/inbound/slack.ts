import { type MessagePart, inferMessageKind } from "@keenai/shared";
import { defaultFileName, isAllowedImMime } from "../mime.js";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

type SlackFile = {
  id?: string;
  name?: string;
  mimetype?: string;
  size?: number;
  url_private_download?: string;
};

type SlackMessageEvent = {
  type?: string;
  subtype?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  channel_type?: string;
  files?: SlackFile[];
  bot_id?: string;
  message?: SlackMessageEvent;
  previous_message?: SlackMessageEvent;
  deleted_ts?: string;
  event_ts?: string;
  reaction?: string;
  item?: { type?: string; channel?: string; ts?: string };
  item_user?: string;
};

export type SlackEventCallback = {
  type?: string;
  team_id?: string;
  team?: { id?: string };
  event?: SlackMessageEvent;
  challenge?: string;
  user?: { id?: string };
  channel?: { id?: string };
  container?: { message_ts?: string; channel_id?: string };
  message?: { ts?: string; thread_ts?: string };
  trigger_id?: string;
  actions?: Array<{ action_id?: string; value?: string; action_ts?: string }>;
};

/** Normalize a Slack Events API callback into a KeenAI inbound IM message. */
export function adaptSlackEvent(payload: SlackEventCallback): ParsedInboundImMessage | null {
  if (payload.type === "url_verification") return null;
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    const buttonId = action?.value ?? action?.action_id;
    const channelId = payload.channel?.id ?? payload.container?.channel_id;
    const messageTs = payload.container?.message_ts;
    if (!buttonId || !channelId || !messageTs) return null;
    const threadRoot = payload.message?.thread_ts ?? messageTs;
    return {
      platformMessageId: `interaction:${payload.trigger_id ?? action?.action_ts ?? `${messageTs}:${payload.user?.id ?? "unknown"}:${buttonId}`}`,
      channelType: "slack",
      conversationKey: slackConversationKey(channelId, threadRoot, "channel"),
      channelId,
      providerThreadId: threadRoot,
      userId: payload.user?.id ?? "slack-user",
      plainText: buttonId,
      parts: [{ type: "text", text: buttonId }],
      messageKind: "text",
      attachments: [],
      replyToMessageId: messageTs,
      interaction: { type: "button", id: buttonId },
      conversationAttributes: slackConversationAttributes(payload),
    };
  }
  const event = payload.event;
  if (!event) return null;
  if (event.type === "reaction_added" || event.type === "reaction_removed") {
    if (
      event.item?.type !== "message" ||
      !event.item.channel ||
      !event.item.ts ||
      !event.reaction
    ) {
      return null;
    }
    const actorId = event.user ?? "slack-user";
    return {
      platformMessageId: event.item.ts,
      channelType: "slack",
      conversationKey: event.item.channel,
      channelId: event.item.channel,
      userId: actorId,
      plainText: `:${event.reaction}:`,
      parts: [{ type: "text", text: `:${event.reaction}:` }],
      messageKind: "text",
      attachments: [],
      mutation: {
        type: event.type === "reaction_added" ? "reaction.added" : "reaction.removed",
        targetProviderMessageId: event.item.ts,
        actorId,
        emoji: `:${event.reaction}:`,
      },
      conversationAttributes: slackConversationAttributes(payload),
    };
  }
  if (event.type !== "message") return null;
  if (event.subtype === "message_deleted") {
    const target = event.deleted_ts ?? event.previous_message?.ts;
    if (!event.channel || !target) return null;
    return {
      platformMessageId: target,
      channelType: "slack",
      conversationKey: event.channel,
      channelId: event.channel,
      userId: event.previous_message?.user ?? event.user ?? "slack-user",
      plainText: "(message deleted)",
      parts: [],
      messageKind: "text",
      attachments: [],
      mutation: { type: "message.deleted", targetProviderMessageId: target },
      conversationAttributes: slackConversationAttributes(payload),
    };
  }
  if (event.subtype === "message_changed") {
    const changed = event.message;
    if (!changed?.ts || !event.channel || changed.bot_id) return null;
    const parsed = slackMessage(payload, { ...changed, channel: event.channel });
    if (!parsed) return null;
    return {
      ...parsed,
      mutation: {
        type: "message.updated",
        targetProviderMessageId: changed.ts,
        replaceAttachments: Array.isArray(changed.files),
      },
    };
  }
  if (event.subtype && event.subtype !== "file_share") return null;
  if (event.bot_id) return null;
  return slackMessage(payload, event);
}

function slackMessage(
  payload: SlackEventCallback,
  event: SlackMessageEvent,
): ParsedInboundImMessage | null {
  if (!event.channel || !event.ts) return null;

  const attachments: ImPendingAttachment[] = [];
  for (const file of event.files ?? []) {
    if (!file.id || !file.mimetype || !isAllowedImMime(file.mimetype)) continue;
    attachments.push({
      fileName: file.name ?? defaultFileName(file.mimetype, file.id),
      contentType: file.mimetype,
      sizeBytes: file.size ?? 0,
      platform: "slack",
      platformRef: file.url_private_download ?? file.id,
    });
  }

  const text = event.text?.trim();
  if (attachments.length === 0 && text === undefined) return null;

  const parts = buildInboundParts(text, attachments);
  const threadRoot = event.thread_ts ?? event.ts;
  const isDirectMessage = event.channel_type === "im" || event.channel_type === "mpim";

  return {
    platformMessageId: event.ts,
    channelType: "slack",
    conversationKey: slackConversationKey(
      event.channel,
      threadRoot,
      isDirectMessage && !event.thread_ts ? "direct" : "channel",
    ),
    channelId: event.channel,
    providerThreadId: isDirectMessage && !event.thread_ts ? undefined : threadRoot,
    userId: event.user ?? "slack-user",
    plainText: text || summarizeMedia(attachments),
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    replyToMessageId: event.thread_ts && event.thread_ts !== event.ts ? event.thread_ts : undefined,
    conversationAttributes: slackConversationAttributes(payload),
  };
}

function slackConversationKey(
  channelId: string,
  threadRoot: string,
  kind: "channel" | "direct",
): string {
  return kind === "direct" ? channelId : `${channelId}:${threadRoot}`;
}

function slackConversationAttributes(
  payload: SlackEventCallback,
): Record<string, unknown> | undefined {
  const teamId = payload.team_id ?? payload.team?.id;
  return teamId ? { teamId } : undefined;
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

export function slackUrlVerificationChallenge(payload: SlackEventCallback): string | null {
  if (payload.type === "url_verification" && payload.challenge) return payload.challenge;
  return null;
}
