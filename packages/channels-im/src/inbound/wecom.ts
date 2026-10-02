import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

export type WeComMessagePayload = {
  MsgId?: string | number;
  msgid?: string | number;
  MsgType?: string;
  msgtype?: string;
  Content?: string;
  content?: string;
  FromUserName?: string;
  fromuserid?: string;
  ChatId?: string;
  chatid?: string;
  AgentID?: string | number;
  agentid?: string | number;
  CreateTime?: string | number;
  createtime?: string | number;
  MediaId?: string;
  mediaid?: string;
  PicUrl?: string;
  picurl?: string;
  Format?: string;
  format?: string;
  Event?: string;
  event?: string;
  EventKey?: string;
  eventkey?: string;
  CardType?: string;
  cardtype?: string;
  ResponseCode?: string;
  responsecode?: string;
};

/** Normalize a decrypted WeCom application callback into a KeenAI inbound message. */
export function adaptWeComMessage(payload: WeComMessagePayload): ParsedInboundImMessage | null {
  const messageType = payload.MsgType ?? payload.msgtype;
  const event = payload.Event ?? payload.event;
  const eventKey = payload.EventKey ?? payload.eventkey;
  const userId = payload.FromUserName ?? payload.fromuserid;
  if (messageType === "event" && event === "template_card_event" && eventKey && userId) {
    const chatId = payload.ChatId ?? payload.chatid ?? userId;
    const responseCode = payload.ResponseCode ?? payload.responsecode;
    return {
      platformMessageId:
        responseCode ?? `${chatId}-${payload.CreateTime ?? Date.now()}-${eventKey}`,
      channelType: "wecom",
      channelId: chatId,
      userId,
      plainText: eventKey,
      parts: [{ type: "text", text: eventKey }],
      messageKind: "text",
      attachments: [],
      interaction: { type: "button", id: eventKey },
    };
  }
  const text = messageType === "text" ? (payload.Content ?? payload.content)?.trim() : undefined;
  const attachment = wecomAttachment(payload, messageType);
  if ((!text && !attachment) || !userId) return null;

  const chatId = payload.ChatId ?? payload.chatid ?? userId;
  const messageId =
    payload.MsgId ??
    payload.msgid ??
    `${chatId}-${payload.CreateTime ?? payload.createtime ?? Date.now()}`;
  const parts: MessagePart[] = [];
  if (text) parts.push({ type: "text", text });
  if (attachment) parts.push(wecomAttachmentPart(attachment, messageType));
  const agentId = payload.AgentID ?? payload.agentid;

  return {
    platformMessageId: String(messageId),
    channelType: "wecom",
    channelId: chatId,
    userId,
    plainText: text || wecomAttachmentSummary(attachment),
    parts,
    messageKind: inferMessageKind(parts),
    attachments: attachment ? [attachment] : [],
    conversationAttributes: agentId === undefined ? undefined : { wecomAgentId: agentId },
  };
}

function wecomAttachment(
  payload: WeComMessagePayload,
  messageType: string | undefined,
): ImPendingAttachment | null {
  if (!["image", "voice", "video", "file"].includes(messageType ?? "")) return null;
  const mediaId = payload.MediaId ?? payload.mediaid;
  const publicUrl = payload.PicUrl ?? payload.picurl;
  const platformRef = mediaId ?? publicUrl;
  if (!platformRef) return null;
  const extension =
    messageType === "image"
      ? "jpg"
      : messageType === "voice"
        ? (payload.Format ?? payload.format ?? "amr")
        : messageType === "video"
          ? "mp4"
          : "bin";
  const contentType =
    messageType === "image"
      ? "image/jpeg"
      : messageType === "voice"
        ? `audio/${extension}`
        : messageType === "video"
          ? "video/mp4"
          : "application/octet-stream";
  return {
    fileName: `${mediaId ?? "wecom-file"}.${extension}`,
    contentType,
    sizeBytes: 0,
    platform: "wecom",
    platformRef,
  };
}

function wecomAttachmentPart(
  attachment: ImPendingAttachment,
  messageType: string | undefined,
): MessagePart {
  if (messageType === "image") return { type: "image", attachmentId: "pending-0" };
  if (messageType === "voice") return { type: "audio", attachmentId: "pending-0" };
  if (messageType === "video") return { type: "video", attachmentId: "pending-0" };
  return { type: "file", attachmentId: "pending-0", fileName: attachment.fileName };
}

function wecomAttachmentSummary(attachment: ImPendingAttachment | null): string {
  if (!attachment) return "";
  if (attachment.contentType.startsWith("image/")) return `[Image: ${attachment.fileName}]`;
  if (attachment.contentType.startsWith("audio/")) return "[Voice message]";
  if (attachment.contentType.startsWith("video/")) return `[Video: ${attachment.fileName}]`;
  return `[File: ${attachment.fileName}]`;
}
