import { type MessagePart, inferMessageKind } from "@keenai/shared";
import type { ImPendingAttachment, ParsedInboundImMessage } from "../types.js";

export type DingTalkRobotPayload = {
  msgtype?: string;
  text?: { content?: string };
  content?: {
    downloadCode?: string;
    fileName?: string;
    duration?: number;
    richText?: Array<{
      type?: string;
      text?: string;
      downloadCode?: string;
      fileName?: string;
    }>;
  };
  msgId?: string;
  createAt?: number;
  conversationId?: string;
  conversationType?: string;
  conversationTitle?: string;
  senderId?: string;
  senderStaffId?: string;
  senderNick?: string;
  senderCorpId?: string;
  chatbotCorpId?: string;
  robotCode?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
};

/** Normalize a DingTalk custom robot callback into a KeenAI inbound IM message. */
export function adaptDingTalkRobot(payload: DingTalkRobotPayload): ParsedInboundImMessage | null {
  const text =
    payload.msgtype === "text"
      ? payload.text?.content?.trim()
      : payload.msgtype === "richText"
        ? dingtalkRichText(payload)
        : undefined;
  const attachments = dingtalkAttachments(payload);
  if ((!text && attachments.length === 0) || !payload.conversationId) return null;

  const parts: MessagePart[] = [];
  if (text) parts.push({ type: "text", text });
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (attachment) parts.push(dingtalkAttachmentPart(attachment, payload.msgtype, index));
  }
  const conversationAttributes: Record<string, unknown> = {};
  if (payload.sessionWebhook) {
    conversationAttributes.sessionWebhook = payload.sessionWebhook;
  }
  if (typeof payload.sessionWebhookExpiredTime === "number") {
    conversationAttributes.sessionWebhookExpiredTime = payload.sessionWebhookExpiredTime;
  }
  if (payload.conversationTitle) {
    conversationAttributes.conversationTitle = payload.conversationTitle;
  }
  if (payload.chatbotCorpId) {
    conversationAttributes.chatbotCorpId = payload.chatbotCorpId;
  }
  if (payload.senderCorpId) {
    conversationAttributes.senderCorpId = payload.senderCorpId;
  }
  if (payload.robotCode) {
    conversationAttributes.robotCode = payload.robotCode;
  }
  if (payload.senderStaffId) {
    conversationAttributes.senderStaffId = payload.senderStaffId;
  }
  if (payload.conversationType) {
    conversationAttributes.conversationType = payload.conversationType;
  }

  return {
    platformMessageId:
      payload.msgId ?? `${payload.conversationId}-${payload.createAt ?? Date.now()}`,
    channelType: "dingtalk",
    channelId: payload.conversationId,
    userId: payload.senderId ?? payload.senderNick ?? "dingtalk-user",
    plainText: text || dingtalkAttachmentSummary(attachments[0] ?? null),
    parts,
    messageKind: inferMessageKind(parts),
    attachments,
    conversationAttributes:
      Object.keys(conversationAttributes).length > 0 ? conversationAttributes : undefined,
  };
}

function dingtalkAttachments(payload: DingTalkRobotPayload): ImPendingAttachment[] {
  if (payload.msgtype === "richText") {
    return (payload.content?.richText ?? []).flatMap((item, index) => {
      if (!item.downloadCode) return [];
      const itemType = item.type?.toLowerCase();
      const contentType =
        itemType === "picture" || itemType === "image"
          ? "image/jpeg"
          : itemType === "audio"
            ? "audio/amr"
            : itemType === "video"
              ? "video/mp4"
              : "application/octet-stream";
      return [
        {
          fileName:
            item.fileName ??
            `dingtalk-rich-${index + 1}.${contentType === "image/jpeg" ? "jpg" : contentType === "audio/amr" ? "amr" : contentType === "video/mp4" ? "mp4" : "bin"}`,
          contentType,
          sizeBytes: 0,
          platform: "dingtalk" as const,
          platformRef: JSON.stringify({
            downloadCode: item.downloadCode,
            ...(payload.robotCode ? { robotCode: payload.robotCode } : {}),
          }),
        },
      ];
    });
  }
  if (!["picture", "audio", "video", "file"].includes(payload.msgtype ?? "")) return [];
  const downloadCode = payload.content?.downloadCode;
  if (!downloadCode) return [];
  const messageType = payload.msgtype;
  const contentType =
    messageType === "picture"
      ? "image/jpeg"
      : messageType === "audio"
        ? "audio/amr"
        : messageType === "video"
          ? "video/mp4"
          : "application/octet-stream";
  return [
    {
      fileName:
        payload.content?.fileName ??
        `${payload.msgId ?? "dingtalk-file"}.${messageType === "picture" ? "jpg" : messageType === "audio" ? "amr" : messageType === "video" ? "mp4" : "bin"}`,
      contentType,
      sizeBytes: 0,
      platform: "dingtalk",
      platformRef: JSON.stringify({
        downloadCode,
        ...(payload.robotCode ? { robotCode: payload.robotCode } : {}),
      }),
    },
  ];
}

function dingtalkAttachmentPart(
  attachment: ImPendingAttachment,
  messageType: string | undefined,
  index: number,
): MessagePart {
  const attachmentId = `pending-${index}`;
  if (messageType === "picture" || attachment.contentType.startsWith("image/")) {
    return { type: "image", attachmentId };
  }
  if (messageType === "audio" || attachment.contentType.startsWith("audio/")) {
    return { type: "audio", attachmentId };
  }
  if (messageType === "video" || attachment.contentType.startsWith("video/")) {
    return { type: "video", attachmentId };
  }
  return { type: "file", attachmentId, fileName: attachment.fileName };
}

function dingtalkRichText(payload: DingTalkRobotPayload): string | undefined {
  const text = (payload.content?.richText ?? [])
    .flatMap((item) => (typeof item.text === "string" ? [item.text] : []))
    .join("")
    .trim();
  return text || undefined;
}

function dingtalkAttachmentSummary(attachment: ImPendingAttachment | null): string {
  if (!attachment) return "";
  if (attachment.contentType.startsWith("image/")) return `[Image: ${attachment.fileName}]`;
  if (attachment.contentType.startsWith("audio/")) return "[Voice message]";
  if (attachment.contentType.startsWith("video/")) return `[Video: ${attachment.fileName}]`;
  return `[File: ${attachment.fileName}]`;
}
