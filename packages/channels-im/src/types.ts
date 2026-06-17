import type { MessageKind, MessagePart, OutboundDirectives } from "@keenai/shared";

export type ImPlatform = "telegram" | "slack" | "discord" | "feishu" | "dingtalk";

export type ImPendingAttachment = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  platform: ImPlatform;
  platformRef: string;
  /** Pre-downloaded bytes (tests or inline webhook payloads) */
  content?: Uint8Array;
};

export type ParsedInboundImMessage = {
  platformMessageId: string;
  channelType: ImPlatform;
  channelId: string;
  userId: string;
  plainText: string;
  parts: MessagePart[];
  messageKind: MessageKind;
  attachments: ImPendingAttachment[];
  replyToMessageId?: string;
  mediaGroupId?: string;
  conversationAttributes?: Record<string, unknown>;
};

export type ImAttachmentRef = {
  attachmentId: string;
  contentUrl: string;
  contentType: string;
  fileName: string;
};

export type TelegramOutboundAction =
  | { platform: "telegram"; method: "sendMessage"; chatId: string; text: string }
  | {
      platform: "telegram";
      method: "sendPhoto";
      chatId: string;
      photoUrl: string;
      caption?: string;
    }
  | {
      platform: "telegram";
      method: "sendVoice";
      chatId: string;
      voiceUrl: string;
      caption?: string;
    }
  | {
      platform: "telegram";
      method: "sendVideo";
      chatId: string;
      videoUrl: string;
      caption?: string;
    }
  | {
      platform: "telegram";
      method: "sendDocument";
      chatId: string;
      documentUrl: string;
      caption?: string;
      fileName?: string;
    };

export type SlackOutboundAction =
  | { platform: "slack"; method: "chat.postMessage"; channel: string; text: string }
  | {
      platform: "slack";
      method: "files.upload";
      channel: string;
      fileUrl: string;
      fileName: string;
      title?: string;
    };

export type DiscordOutboundAction = {
  platform: "discord";
  method: "createMessage";
  channelId: string;
  content: string;
};

export type FeishuOutboundAction = {
  platform: "feishu";
  method: "im.message.create";
  receiveId: string;
  receiveIdType: "chat_id" | "open_id";
  text: string;
};

export type DingTalkOutboundAction = {
  platform: "dingtalk";
  method: "sessionWebhook.send";
  sessionWebhook: string;
  text: string;
};

export type ImOutboundAction =
  | TelegramOutboundAction
  | SlackOutboundAction
  | DiscordOutboundAction
  | FeishuOutboundAction
  | DingTalkOutboundAction;

export type PlanImOutboundInput = {
  platform: ImPlatform;
  targetId: string;
  parts: MessagePart[];
  attachments: Map<string, ImAttachmentRef>;
  directives?: OutboundDirectives;
  channelAttributes?: Record<string, unknown>;
};
