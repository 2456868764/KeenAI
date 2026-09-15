import type {
  WidgetAnswerCitation,
  WidgetChangelogEntry,
  WidgetConfig,
  WidgetConversationSummary,
  WidgetHelpArticle,
  WidgetHelpArticleDetail,
  WidgetHelpCollection,
  WidgetHome,
  WidgetMessagePayload,
  WidgetTicket,
  WidgetUser,
} from "./types.js";

export type WidgetSession = {
  accessToken: string;
  expiresIn: number;
  org: { id: string; slug: string };
  brand: { id: string; slug: string };
  user: WidgetUser;
};

export type WidgetConversation = {
  id: string;
  status: string;
  subject: string | null;
  customerReplyDisabled?: boolean;
};

export type WidgetMessage = WidgetMessagePayload & {
  createdAt: string;
};

export type WidgetAnswerStreamCallbacks = {
  onSearching?: (query: string) => void;
  onMeta?: (meta: {
    logId?: string;
    providerId?: string | null;
    citations: WidgetAnswerCitation[];
  }) => void;
  onTextDelta?: (text: string) => void;
  onDone?: () => void;
};

function apiBase(apiUrl?: string): string {
  return (apiUrl ?? "http://localhost:8090").replace(/\/$/, "");
}

export async function createWidgetSession(input: {
  apiUrl?: string;
  orgSlug: string;
  brandSlug?: string;
  user: WidgetUser;
}): Promise<WidgetSession> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgSlug: input.orgSlug,
      brandSlug: input.brandSlug ?? "default",
      user: input.user,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `session_failed:${res.status}`);
  }
  return res.json() as Promise<WidgetSession>;
}

export async function getOrCreateWidgetConversation(input: {
  apiUrl?: string;
  accessToken: string;
  initialMessage?: string;
}): Promise<{ conversation: WidgetConversation; created: boolean }> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(
      input.initialMessage ? { initialMessage: { plainText: input.initialMessage } } : {},
    ),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `conversation_failed:${res.status}`);
  }
  const body = (await res.json()) as {
    conversation: WidgetConversation;
    created?: boolean;
  };
  return { conversation: body.conversation, created: body.created ?? res.status === 201 };
}

export async function fetchWidgetConfig(input: {
  apiUrl?: string;
  accessToken: string;
}): Promise<WidgetConfig> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/config`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`config_failed:${res.status}`);
  const body = (await res.json()) as { config: WidgetConfig };
  return body.config;
}

export async function fetchWidgetConversations(input: {
  apiUrl?: string;
  accessToken: string;
  limit?: number;
}): Promise<WidgetConversationSummary[]> {
  const q = new URLSearchParams();
  if (input.limit) q.set("limit", String(input.limit));
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/conversations${suffix}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`conversations_failed:${res.status}`);
  const body = (await res.json()) as { items: WidgetConversationSummary[] };
  return body.items;
}

export async function fetchWidgetHome(input: {
  apiUrl?: string;
  accessToken: string;
}): Promise<WidgetHome> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/home`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`home_failed:${res.status}`);
  const body = (await res.json()) as { home: WidgetHome };
  return body.home;
}

export async function fetchWidgetHelpCollections(input: {
  apiUrl?: string;
  accessToken: string;
}): Promise<WidgetHelpCollection[]> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/help/collections`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`help_collections_failed:${res.status}`);
  const body = (await res.json()) as { items: WidgetHelpCollection[] };
  return body.items;
}

export async function fetchWidgetHelpArticles(input: {
  apiUrl?: string;
  accessToken: string;
  collection?: string;
  query?: string;
}): Promise<WidgetHelpArticle[]> {
  const q = new URLSearchParams();
  if (input.collection) q.set("collection", input.collection);
  if (input.query) q.set("q", input.query);
  const suffix = q.size > 0 ? `?${q}` : "";
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/help/articles${suffix}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`help_articles_failed:${res.status}`);
  const body = (await res.json()) as { items: WidgetHelpArticle[] };
  return body.items;
}

export async function fetchWidgetHelpArticle(input: {
  apiUrl?: string;
  accessToken: string;
  articleId: string;
}): Promise<WidgetHelpArticleDetail> {
  const res = await fetch(
    `${apiBase(input.apiUrl)}/api/v1/widget/help/articles/${input.articleId}`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  );
  if (!res.ok) throw new Error(`help_article_failed:${res.status}`);
  const body = (await res.json()) as { article: WidgetHelpArticleDetail };
  return body.article;
}

export async function fetchWidgetChangelogEntries(input: {
  apiUrl?: string;
  accessToken: string;
}): Promise<WidgetChangelogEntry[]> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/changelog/entries`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) throw new Error(`changelog_failed:${res.status}`);
  const body = (await res.json()) as { items: WidgetChangelogEntry[] };
  return body.items;
}

export async function fetchWidgetChangelogEntry(input: {
  apiUrl?: string;
  accessToken: string;
  slug: string;
}): Promise<WidgetChangelogEntry> {
  const res = await fetch(
    `${apiBase(input.apiUrl)}/api/v1/widget/changelog/entries/${input.slug}`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  );
  if (!res.ok) throw new Error(`changelog_entry_failed:${res.status}`);
  const body = (await res.json()) as { entry: WidgetChangelogEntry };
  return body.entry;
}

export async function createWidgetTicket(input: {
  apiUrl?: string;
  accessToken: string;
  type: string;
  title: string;
  description: string;
  attachmentIds?: string[];
}): Promise<{ ticket: WidgetTicket; conversation: WidgetConversation }> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      type: input.type,
      title: input.title,
      description: input.description,
      attachmentIds: input.attachmentIds,
    }),
  });
  if (!res.ok) throw new Error(`ticket_failed:${res.status}`);
  return res.json() as Promise<{ ticket: WidgetTicket; conversation: WidgetConversation }>;
}

export async function fetchWidgetMessages(input: {
  apiUrl?: string;
  accessToken: string;
  conversationId: string;
}): Promise<WidgetMessage[]> {
  const res = await fetch(
    `${apiBase(input.apiUrl)}/api/v1/widget/conversations/${input.conversationId}/messages`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
  if (!res.ok) throw new Error(`messages_failed:${res.status}`);
  const body = (await res.json()) as { items: WidgetMessage[] };
  return body.items;
}

export async function uploadWidgetImage(input: {
  apiUrl?: string;
  accessToken: string;
  file: File;
}): Promise<{ attachmentId: string }> {
  const base = apiBase(input.apiUrl);
  const presignRes = await fetch(`${base}/api/v1/widget/uploads/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      fileName: input.file.name,
      contentType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
    }),
  });
  if (!presignRes.ok) throw new Error(`presign_failed:${presignRes.status}`);
  const presigned = (await presignRes.json()) as { uploadUrl: string };

  const uploadRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": input.file.type || "application/octet-stream",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: input.file,
  });
  if (!uploadRes.ok) throw new Error(`upload_failed:${uploadRes.status}`);
  return uploadRes.json() as Promise<{ attachmentId: string }>;
}

export async function postWidgetMessage(input: {
  apiUrl?: string;
  accessToken: string;
  conversationId: string;
  plainText?: string;
  attachmentIds?: string[];
}): Promise<WidgetMessage> {
  const res = await fetch(
    `${apiBase(input.apiUrl)}/api/v1/widget/conversations/${input.conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        plainText: input.plainText,
        attachmentIds: input.attachmentIds,
      }),
    },
  );
  if (!res.ok) throw new Error(`send_failed:${res.status}`);
  const body = (await res.json()) as { message: WidgetMessage };
  return body.message;
}

export async function requestWidgetHandoff(input: {
  apiUrl?: string;
  accessToken: string;
  conversationId: string;
  message?: string;
}): Promise<{ message: WidgetMessage; conversation: WidgetConversation }> {
  const res = await fetch(
    `${apiBase(input.apiUrl)}/api/v1/widget/conversations/${input.conversationId}/handoff`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({ message: input.message }),
    },
  );
  if (!res.ok) throw new Error(`handoff_failed:${res.status}`);
  return res.json() as Promise<{ message: WidgetMessage; conversation: WidgetConversation }>;
}

export async function streamWidgetAnswer(
  input: {
    apiUrl?: string;
    accessToken: string;
    conversationId: string;
    query: string;
    limit?: number;
    rerank?: boolean;
  },
  callbacks: WidgetAnswerStreamCallbacks,
): Promise<void> {
  const res = await fetch(`${apiBase(input.apiUrl)}/api/v1/widget/answer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      conversationId: input.conversationId,
      query: input.query,
      limit: input.limit ?? 5,
      rerank: input.rerank ?? true,
    }),
  });
  if (!res.ok) throw new Error(`answer_failed:${res.status}`);
  if (!res.body) throw new Error("answer_stream_unavailable");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\n\n+/);
    buffer = done ? "" : (blocks.pop() ?? "");

    for (const block of blocks) {
      handleSseBlock(block, callbacks);
    }

    if (done) break;
  }

  if (buffer.trim()) handleSseBlock(buffer, callbacks);
}

function handleSseBlock(block: string, callbacks: WidgetAnswerStreamCallbacks) {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return;
  const payload = parseSsePayload(dataLines.join("\n"));

  if (event === "searching") {
    callbacks.onSearching?.(typeof payload.query === "string" ? payload.query : "");
    return;
  }
  if (event === "meta") {
    callbacks.onMeta?.({
      logId: typeof payload.logId === "string" ? payload.logId : undefined,
      providerId: typeof payload.providerId === "string" ? payload.providerId : null,
      citations: Array.isArray(payload.citations)
        ? payload.citations.filter(isWidgetAnswerCitation)
        : [],
    });
    return;
  }
  if (event === "text-delta" || event === "message") {
    if (typeof payload.text === "string") callbacks.onTextDelta?.(payload.text);
    return;
  }
  if (event === "done") callbacks.onDone?.();
  if (event === "error") {
    throw new Error(typeof payload.error === "string" ? payload.error : "answer_stream_failed");
  }
}

function parseSsePayload(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { text: data };
  }
}

function isWidgetAnswerCitation(value: unknown): value is WidgetAnswerCitation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.chunkId === "string" && typeof item.documentTitle === "string";
}

export async function fetchWidgetAttachmentBlob(input: {
  apiUrl?: string;
  accessToken: string;
  attachmentId: string;
}): Promise<string> {
  const res = await fetch(
    `${apiBase(input.apiUrl)}/api/v1/attachments/${input.attachmentId}/content`,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
  );
  if (!res.ok) throw new Error(`attachment_failed:${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
