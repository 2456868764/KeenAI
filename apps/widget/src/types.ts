export type WidgetUser = {
  id: string;
  userHash: string;
  email?: string;
  name?: string;
};

export type WidgetAttachment = {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  url?: string;
};

export type WidgetMessagePayload = {
  id: string;
  plainText: string;
  senderType: string;
  createdAt?: string;
  messageKind?: string;
  attachments?: WidgetAttachment[];
};

export type ConversationRealtimeEvent = {
  type: string;
  conversationId?: string;
  message?: WidgetMessagePayload;
  conversation?: unknown;
};

export type SendWidgetMessageInput = {
  plainText?: string;
  attachmentIds?: string[];
};
