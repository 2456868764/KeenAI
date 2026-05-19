export type WidgetUser = {
  id: string;
  userHash: string;
  email?: string;
  name?: string;
};

export type ConversationRealtimeEvent = {
  type: string;
  conversationId?: string;
  message?: { id: string; plainText: string; senderType: string };
  conversation?: unknown;
};
