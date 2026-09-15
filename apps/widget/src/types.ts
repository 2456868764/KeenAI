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

export type WidgetModuleKey = "home" | "messages" | "help" | "changelog" | "tickets";

export type WidgetConfig = {
  org: { id: string; slug: string; name: string };
  brand: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string | null;
    primaryColor: string;
  };
  agent: {
    name: string;
    subtitle: string;
    greetingTitle: string;
    greetingBody: string;
    avatarUrl?: string | null;
  };
  modules: Record<WidgetModuleKey, boolean>;
  menuItems: {
    id: string;
    label: string;
    description?: string | null;
    icon?: string | null;
    type: "module" | "external";
    module?: WidgetModuleKey | null;
    href?: string | null;
    location: "bottom_nav" | "home_card" | "portal_menu";
    sortOrder: number;
  }[];
  quickActions: {
    id: string;
    label: string;
    type: "start_chat" | "submit_ticket" | "open_help" | "open_url";
    payload: Record<string, unknown>;
    sortOrder: number;
  }[];
  poweredBy: boolean;
};

export type WidgetConversationSummary = {
  id: string;
  status: string;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderType: string | null;
  lastMessageCreatedAt: string | null;
  unreadCount: number;
  customerReplyDisabled?: boolean;
};
