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
  files?: SlackFile[];
  bot_id?: string;
};

export type SlackEventCallback = {
  type?: string;
  event?: SlackMessageEvent;
  challenge?: string;
};

/** Normalize a Slack Events API callback into a KeenAI inbound IM message. */
export function adaptSlackEvent(payload: SlackEventCallback): ParsedInboundImMessage | null {
  if (payload.type === "url_verification") return null;
  const event = payload.event;
  if (!event || event.type !== "message") return null;
  if (event.subtype && event.subtype !== "file_share") return null;
  if (event.bot_id) return null;
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
  if (attachments.length === 0 && !text) return null;

  const parts = buildInboundParts(text, attachments);

  return {
    platformMessageId: event.ts,
    channelType: "slack",
    channelId: event.channel,
    userId: event.user ?? "slack-user",
    plainText: text || summarizeMedia(attachments),
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    replyToMessageId: event.thread_ts && event.thread_ts !== event.ts ? event.thread_ts : undefined,
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

export function slackUrlVerificationChallenge(payload: SlackEventCallback): string | null {
  if (payload.type === "url_verification" && payload.challenge) return payload.challenge;
  return null;
}
