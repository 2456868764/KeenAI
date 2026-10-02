import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

export type WeChatMessagePayload = {
  ToUserName?: string;
  FromUserName?: string;
  CreateTime?: string | number;
  MsgType?: string;
  Content?: string;
  BizMsgMenuId?: string | number;
  bizmsgmenuid?: string | number;
  MsgId?: string | number;
  MsgDataId?: string | number;
  Idx?: string | number;
  MediaId?: string;
  PicUrl?: string;
  Format?: string;
  Recognition?: string;
  ThumbMediaId?: string;
  Location_X?: string | number;
  Location_Y?: string | number;
  Scale?: string | number;
  Label?: string;
  Title?: string;
  Description?: string;
  Url?: string;
  Event?: string;
  EventKey?: string;
};

/** Normalize a WeChat Official Account callback into a KeenAI inbound message. */
export function adaptWeChatMessage(payload: WeChatMessagePayload): ParsedInboundImMessage | null {
  const userId = payload.FromUserName;
  const accountId = payload.ToUserName;
  const messageType = payload.MsgType?.toLowerCase();
  if (!userId || !accountId || !messageType) return null;

  if (messageType === "event") {
    const event = payload.Event?.toLowerCase();
    const eventKey = payload.EventKey?.trim();
    if (
      !eventKey ||
      !["click", "view", "scancode_push", "scancode_waitmsg"].includes(event ?? "")
    ) {
      return null;
    }
    return {
      platformMessageId: eventMessageId(payload, eventKey),
      channelType: "wechat",
      channelId: userId,
      userId,
      plainText: eventKey,
      parts: [{ type: "text", text: eventKey }],
      messageKind: "text",
      attachments: [],
      interaction: { type: "button", id: eventKey },
      conversationAttributes: { wechatAppId: accountId, wechatEvent: event },
    };
  }

  const text = messageType === "text" ? payload.Content?.trim() : undefined;
  const menuId = payload.BizMsgMenuId ?? payload.bizmsgmenuid;
  const attachment = wechatAttachment(payload, messageType);
  const location = messageType === "location" ? locationText(payload) : undefined;
  const link = messageType === "link" ? linkText(payload) : undefined;
  const plainText = text ?? location ?? link ?? attachmentSummary(attachment);
  if (!plainText && !attachment) return null;

  const parts: MessagePart[] = [];
  if (plainText) parts.push({ type: "text", text: plainText });
  if (attachment) parts.push(attachmentPart(attachment, messageType));
  return {
    platformMessageId: messageId(payload),
    channelType: "wechat",
    channelId: userId,
    userId,
    plainText,
    parts,
    messageKind: inferMessageKind(parts),
    attachments: attachment ? [attachment] : [],
    interaction:
      messageType === "text" && menuId !== undefined
        ? { type: "button", id: String(menuId) }
        : undefined,
    conversationAttributes: {
      wechatAppId: accountId,
      ...(payload.Recognition ? { voiceRecognition: payload.Recognition } : {}),
    },
  };
}

function wechatAttachment(
  payload: WeChatMessagePayload,
  messageType: string,
): ImPendingAttachment | null {
  if (!["image", "voice", "video", "shortvideo"].includes(messageType)) return null;
  const mediaId = payload.MediaId;
  if (!mediaId) return null;
  const kind = messageType === "shortvideo" ? "video" : messageType;
  const extension = kind === "image" ? "jpg" : kind === "voice" ? (payload.Format ?? "amr") : "mp4";
  return {
    fileName: `wechat-${payload.MsgId ?? mediaId}.${extension}`,
    contentType:
      kind === "image" ? "image/jpeg" : kind === "voice" ? `audio/${extension}` : "video/mp4",
    sizeBytes: 0,
    platform: "wechat",
    platformRef: mediaId,
  };
}

function attachmentPart(attachment: ImPendingAttachment, messageType: string): MessagePart {
  if (messageType === "image") return { type: "image", attachmentId: "pending-0" };
  if (messageType === "voice") return { type: "audio", attachmentId: "pending-0" };
  return { type: "video", attachmentId: "pending-0" };
}

function attachmentSummary(attachment: ImPendingAttachment | null): string {
  if (!attachment) return "";
  if (attachment.contentType.startsWith("image/")) return `[Image: ${attachment.fileName}]`;
  if (attachment.contentType.startsWith("audio/")) return "[Voice message]";
  return `[Video: ${attachment.fileName}]`;
}

function locationText(payload: WeChatMessagePayload): string | undefined {
  if (payload.Location_X === undefined || payload.Location_Y === undefined) return undefined;
  return `[Location: ${payload.Label ?? ""} (${payload.Location_X}, ${payload.Location_Y})]`;
}

function linkText(payload: WeChatMessagePayload): string | undefined {
  if (!payload.Url) return undefined;
  return [payload.Title, payload.Description, payload.Url].filter(Boolean).join("\n");
}

function messageId(payload: WeChatMessagePayload): string {
  if (payload.MsgId !== undefined) return String(payload.MsgId);
  const suffix = payload.MsgDataId !== undefined ? `${payload.MsgDataId}:${payload.Idx ?? 0}` : "0";
  return `${payload.FromUserName}:${payload.CreateTime ?? Date.now()}:${suffix}`;
}

function eventMessageId(payload: WeChatMessagePayload, eventKey: string): string {
  return `${payload.FromUserName}:${payload.CreateTime ?? Date.now()}:${payload.Event}:${eventKey}`;
}
