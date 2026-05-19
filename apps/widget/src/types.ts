export type WidgetUser = {
  id: string;
  userHash: string;
  email?: string;
  name?: string;
};

export type WidgetMessagePayload = {
  id: string;
  plainText: string;
  senderType: string;
  createdAt?: string;
};

export type ConversationRealtimeEvent = {
  type: string;
  conversationId?: string;
  message?: WidgetMessagePayload;
  conversation?: unknown;
};
