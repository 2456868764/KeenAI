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

export type WidgetAnswerCitation = {
  chunkId: string;
  documentTitle: string;
};

export type WidgetAnswerStatus = "idle" | "searching" | "streaming" | "done" | "error";

export type WidgetAnswerState = {
  status: WidgetAnswerStatus;
  text: string;
  citations: WidgetAnswerCitation[];
  error?: string;
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

export type WidgetHome = {
  greeting: {
    title: string;
    body: string;
  };
  quickActions: WidgetConfig["quickActions"];
  featured: {
    id: string;
    type: "kb_article" | "changelog_entry" | "external";
    contentId: string | null;
    title: string | null;
    imageUrl: string | null;
    href: string | null;
    sortOrder: number;
  }[];
  articles: {
    id: string;
    title: string;
    slug: string;
    collection: string;
    excerpt: string | null;
    updatedAt: string;
  }[];
  changelogEntries: {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    publishedAt: string | null;
    updatedAt: string;
  }[];
};

export type WidgetHelpCollection = {
  slug: string;
  name: string;
  articleCount: number;
};

export type WidgetHelpArticle = WidgetHome["articles"][number];

export type WidgetHelpArticleDetail = WidgetHelpArticle & {
  body: string;
  content: Record<string, unknown>;
  url: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type WidgetChangelogEntry = WidgetHome["changelogEntries"][number] & {
  plainText?: string;
};

export type WidgetTicket = {
  id: string;
  title: string;
  statusName: string | null;
  conversationIds: string[];
};
