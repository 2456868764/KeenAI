import type { MessageKind, MessagePart, OutboundDirectives } from "@keenai/shared";

export type ImPlatform =
  | "telegram"
  | "slack"
  | "discord"
  | "feishu"
  | "dingtalk"
  | "whatsapp"
  | "wechat"
  | "wecom";

export type ImPendingAttachment = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  platform: ImPlatform;
  platformRef: string;
  /** Pre-downloaded bytes (tests or inline webhook payloads) */
  content?: Uint8Array;
};

export type ImInboundMutation =
  | {
      type: "message.updated" | "message.deleted";
      targetProviderMessageId: string;
      replaceAttachments?: boolean;
    }
  | {
      type: "reaction.added" | "reaction.removed";
      targetProviderMessageId: string;
      actorId: string;
      emoji: string;
    }
  | {
      type: "reactions.replaced";
      targetProviderMessageId: string;
      actorId: string;
      oldEmojis: string[];
      newEmojis: string[];
    };

export type ParsedInboundImMessage = {
  platformMessageId: string;
  channelType: ImPlatform;
  /** Stable provider conversation key used for internal routing and deduplication. */
  conversationKey?: string;
  channelId: string;
  /** Provider thread root to use for replies when it differs from the channel target. */
  providerThreadId?: string;
  userId: string;
  plainText: string;
  parts: MessagePart[];
  messageKind: MessageKind;
  attachments: ImPendingAttachment[];
  replyToMessageId?: string;
  mediaGroupId?: string;
  mutation?: ImInboundMutation;
  interaction?: { type: "button"; id: string };
  conversationAttributes?: Record<string, unknown>;
};

export type ImAttachmentRef = {
  attachmentId: string;
  contentUrl: string;
  contentType: string;
  fileName: string;
};

type TelegramReplyContext = {
  replyToMessageId?: string;
  messageThreadId?: number;
  businessConnectionId?: string;
};

export type ImInteractiveButton = {
  id: string;
  label: string;
  url?: string;
  callbackUrl?: string;
};

export type TelegramOutboundAction =
  | ({
      platform: "telegram";
      method: "sendMessage";
      chatId: string;
      text: string;
      buttons?: ImInteractiveButton[];
    } & TelegramReplyContext)
  | ({
      platform: "telegram";
      method: "sendPhoto";
      chatId: string;
      photoUrl: string;
      caption?: string;
    } & TelegramReplyContext)
  | ({
      platform: "telegram";
      method: "sendVoice";
      chatId: string;
      voiceUrl: string;
      caption?: string;
    } & TelegramReplyContext)
  | ({
      platform: "telegram";
      method: "sendVideo";
      chatId: string;
      videoUrl: string;
      caption?: string;
    } & TelegramReplyContext)
  | ({
      platform: "telegram";
      method: "sendDocument";
      chatId: string;
      documentUrl: string;
      caption?: string;
      fileName?: string;
    } & TelegramReplyContext);

export type SlackOutboundAction =
  | {
      platform: "slack";
      method: "chat.postMessage";
      channel: string;
      text: string;
      threadTs?: string;
      buttons?: ImInteractiveButton[];
    }
  | {
      platform: "slack";
      method: "files.uploadV2";
      channel: string;
      fileUrl: string;
      fileName: string;
      contentType: string;
      title?: string;
      threadTs?: string;
    };

export type DiscordOutboundAction =
  | {
      platform: "discord";
      method: "createMessage";
      channelId: string;
      content: string;
      replyToMessageId?: string;
      buttons?: ImInteractiveButton[];
    }
  | {
      platform: "discord";
      method: "createMessageWithFile";
      channelId: string;
      content?: string;
      fileUrl: string;
      fileName: string;
      contentType: string;
      description?: string;
      replyToMessageId?: string;
    };

export type FeishuOutboundAction =
  | {
      platform: "feishu";
      method: "im.message.create";
      receiveId: string;
      receiveIdType: "chat_id" | "open_id";
      text: string;
      replyToMessageId?: string;
      buttons?: ImInteractiveButton[];
    }
  | {
      platform: "feishu";
      method: "im.media.uploadAndSend";
      receiveId: string;
      receiveIdType: "chat_id" | "open_id";
      mediaType: "image" | "file";
      fileUrl: string;
      fileName: string;
      contentType: string;
      replyToMessageId?: string;
    };

export type DingTalkOutboundAction =
  | {
      platform: "dingtalk";
      method: "robot.groupMessages.send";
      robotCode: string;
      openConversationId: string;
      msgKey: "sampleText" | "sampleMarkdown" | "sampleActionCard";
      msgParam: string;
    }
  | {
      platform: "dingtalk";
      method: "robot.oToMessages.batchSend";
      robotCode: string;
      userIds: string[];
      msgKey: "sampleText" | "sampleMarkdown" | "sampleActionCard";
      msgParam: string;
    }
  | {
      platform: "dingtalk";
      method: "sessionWebhook.send";
      sessionWebhook: string;
      text: string;
    }
  | {
      platform: "dingtalk";
      method: "sessionWebhook.markdown";
      sessionWebhook: string;
      title: string;
      text: string;
    }
  | {
      platform: "dingtalk";
      method: "sessionWebhook.actionCard";
      sessionWebhook: string;
      title: string;
      text: string;
      buttons: ImInteractiveButton[];
    };

type WhatsAppReplyContext = { replyToMessageId?: string };

export type WhatsAppOutboundAction =
  | ({
      platform: "whatsapp";
      method: "messages.text";
      to: string;
      text: string;
      buttons?: ImInteractiveButton[];
    } & WhatsAppReplyContext)
  | ({
      platform: "whatsapp";
      method: "messages.template";
      to: string;
      templateName: string;
      languageCode: string;
      components?: Record<string, unknown>[];
    } & WhatsAppReplyContext)
  | ({
      platform: "whatsapp";
      method: "messages.image";
      to: string;
      imageUrl: string;
      caption?: string;
    } & WhatsAppReplyContext)
  | ({
      platform: "whatsapp";
      method: "messages.audio";
      to: string;
      audioUrl: string;
    } & WhatsAppReplyContext)
  | ({
      platform: "whatsapp";
      method: "messages.video";
      to: string;
      videoUrl: string;
      caption?: string;
    } & WhatsAppReplyContext)
  | ({
      platform: "whatsapp";
      method: "messages.document";
      to: string;
      documentUrl: string;
      fileName?: string;
      caption?: string;
    } & WhatsAppReplyContext);

export type WeComOutboundAction =
  | {
      platform: "wecom";
      method: "message.send";
      toUser: string;
      agentId: number;
      text: string;
      buttons?: ImInteractiveButton[];
    }
  | {
      platform: "wecom";
      method: "media.uploadAndSend";
      toUser: string;
      agentId: number;
      mediaType: "image" | "voice" | "video" | "file";
      fileUrl: string;
      fileName: string;
      contentType: string;
    };

export type WeChatOutboundAction =
  | {
      platform: "wechat";
      method: "message.send";
      toUser: string;
      text: string;
      buttons?: ImInteractiveButton[];
    }
  | {
      platform: "wechat";
      method: "media.uploadAndSend";
      toUser: string;
      mediaType: "image" | "voice" | "video";
      fileUrl: string;
      fileName: string;
      contentType: string;
      title?: string;
      description?: string;
    };

export type ImOutboundAction =
  | TelegramOutboundAction
  | SlackOutboundAction
  | DiscordOutboundAction
  | FeishuOutboundAction
  | DingTalkOutboundAction
  | WhatsAppOutboundAction
  | WeChatOutboundAction
  | WeComOutboundAction;

export type PlanImOutboundInput = {
  platform: ImPlatform;
  targetId: string;
  parts: MessagePart[];
  attachments: Map<string, ImAttachmentRef>;
  directives?: OutboundDirectives;
  replyToMessageId?: string;
  channelAttributes?: Record<string, unknown>;
};
