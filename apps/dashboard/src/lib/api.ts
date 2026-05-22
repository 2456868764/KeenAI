import { parseApiError } from "./api-errors";
import { getAccessToken } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

export type Conversation = {
  id: string;
  subject: string | null;
  status: string;
  channelType: string;
  assigneeId?: string | null;
  tags?: string[];
  snoozedUntil?: string | null;
  priority?: string | null;
  unreadCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  senderType: string;
  senderId: string | null;
  plainText: string;
  isInternal: boolean;
  createdAt: string;
  messageKind?: string;
  attachments?: MessageAttachment[];
  parts?: { type: string; attachmentId?: string; text?: string; fileName?: string }[];
};

export type MessageAttachment = {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  url?: string;
  thumbnailUrl?: string;
  metadata?: { transcript?: string; transcribedAt?: string };
};

export type LoginResponse = {
  accessToken: string;
  role: string;
  orgId: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(body, `Request failed (${res.status})`));
  }
  return res.json() as Promise<T>;
}

export function getApiUrl(): string {
  return API_URL;
}

export function attachmentContentUrl(attachmentId: string): string {
  return `${API_URL}/api/v1/attachments/${attachmentId}/content`;
}

export function attachmentThumbnailUrl(attachmentId: string): string {
  return `${API_URL}/api/v1/attachments/${attachmentId}/thumbnail`;
}

export async function fetchAttachmentBlob(
  attachmentId: string,
  variant: "content" | "thumbnail" = "content",
): Promise<string> {
  const token = getAccessToken();
  const url =
    variant === "thumbnail"
      ? attachmentThumbnailUrl(attachmentId)
      : attachmentContentUrl(attachmentId);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`attachment_fetch_failed:${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function login(
  email: string,
  password: string,
  orgSlug: string,
): Promise<LoginResponse> {
  return apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, orgSlug }),
  });
}

export async function listConversations(params?: {
  status?: string;
}): Promise<{ items: Conversation[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch(`/api/v1/conversations${qs ? `?${qs}` : ""}`);
}

export async function getConversation(id: string): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/v1/conversations/${id}`);
}

export async function listMessages(id: string): Promise<{ items: Message[] }> {
  return apiFetch(`/api/v1/conversations/${id}/messages`);
}

export async function sendMessage(
  conversationId: string,
  plainText: string,
  opts?: {
    isInternal?: boolean;
    content?: { type: "tiptap"; doc: Record<string, unknown> };
    attachmentIds?: string[];
  },
): Promise<{ message: Message }> {
  return apiFetch(`/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      plainText: plainText || undefined,
      isInternal: opts?.isInternal ?? false,
      content: opts?.content ? { type: "tiptap", doc: opts.content.doc } : undefined,
      attachmentIds: opts?.attachmentIds,
    }),
  });
}

export type Member = { id: string; name: string; email: string; role: string };

export async function listMembers(): Promise<{ items: Member[] }> {
  return apiFetch("/api/v1/members");
}

export type Macro = { slug: string; name: string; body: string };

export async function listMacros(): Promise<{ items: Macro[] }> {
  return apiFetch("/api/v1/macros");
}

export async function createMacro(input: {
  slug: string;
  name: string;
  body: string;
}): Promise<{ macro: Macro }> {
  return apiFetch("/api/v1/macros", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function presignUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{
  uploadId: string;
  uploadUrl: string;
  storageKey: string;
}> {
  return apiFetch("/api/v1/uploads/presign", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadFile(file: File): Promise<{ storageKey: string; contentType: string }> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const presigned = await presignUpload({
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });

  const putRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(parseApiError(body, `Upload failed (${putRes.status})`));
  }

  const result = (await putRes.json()) as { storageKey: string; contentType: string };
  return { storageKey: result.storageKey, contentType: result.contentType };
}

export function uploadFileUrl(storageKey: string): string | null {
  const token = getAccessToken();
  if (!token) return null;
  return `${API_URL}/api/v1/uploads/file/${encodeURIComponent(storageKey)}?access_token=${encodeURIComponent(token)}`;
}

export async function recordCopilotEvent(input: {
  conversationId: string;
  action: "accept" | "edit" | "discard";
  draftLength?: number;
  providerId?: string;
}): Promise<void> {
  await apiFetch("/api/v1/copilot/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CopilotProvider = {
  id: string;
  label: string;
  model?: string;
  isDefault: boolean;
};

export async function listCopilotProviders(): Promise<{
  defaultProviderId: string;
  items: CopilotProvider[];
}> {
  return apiFetch("/api/v1/copilot/providers");
}

/** Stream copilot draft via SSE; calls onChunk for each text delta. */
export async function streamCopilotDraft(
  conversationId: string,
  instruction: string | undefined,
  onChunk: (text: string) => void,
  providerId?: string,
): Promise<{ providerId: string }> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}/api/v1/copilot/draft`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId, instruction, providerId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(body, `Copilot failed (${res.status})`));
  }

  let resolvedProviderId = providerId ?? "stub";
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (event === "meta") {
        const meta = JSON.parse(data) as { providerId: string };
        resolvedProviderId = meta.providerId;
      } else if (data && event !== "done") {
        const payload = JSON.parse(data) as { text?: string };
        if (payload.text) onChunk(payload.text);
      }
    }
  }

  return { providerId: resolvedProviderId };
}

export async function updateConversation(
  id: string,
  patch: {
    status?: string;
    assigneeId?: string | null;
    subject?: string;
    tags?: string[];
    snoozedUntil?: string | null;
    priority?: string;
  },
): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/v1/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function conversationStreamUrl(conversationId: string): string | null {
  const token = getAccessToken();
  if (!token) return null;
  return `${API_URL}/api/v1/conversations/${conversationId}/stream?access_token=${encodeURIComponent(token)}`;
}

export type Notification = {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listNotifications(): Promise<{
  items: Notification[];
  unreadCount: number;
}> {
  return apiFetch("/api/v1/notifications?unreadOnly=false&limit=30");
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
}

export async function searchConversations(
  q: string,
): Promise<{ items: (Conversation & { snippet?: string })[] }> {
  const qs = new URLSearchParams({ q });
  return apiFetch(`/api/v1/search/conversations?${qs}`);
}

export type WorkflowBlock =
  | { id: string; type: "send_message"; plainText?: string; attachmentIds?: string[] }
  | { id: string; type: "assign"; assigneeId?: string | null }
  | { id: string; type: "close" };

export type WorkflowDefinition = {
  trigger: "first_message" | "customer_unresponsive";
  inactivityMinutes?: number;
  blocks: WorkflowBlock[];
};

export type Workflow = {
  id: string;
  orgId: string;
  brandId: string | null;
  name: string;
  trigger: string;
  definition: WorkflowDefinition;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

export async function listWorkflows(): Promise<{ items: Workflow[] }> {
  return apiFetch("/api/v1/workflows");
}

export async function getWorkflow(id: string): Promise<{ workflow: Workflow }> {
  return apiFetch(`/api/v1/workflows/${id}`);
}

export async function createWorkflow(input: {
  name: string;
  brandId?: string;
  definition: WorkflowDefinition;
}): Promise<{ workflow: Workflow }> {
  return apiFetch("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateWorkflow(
  id: string,
  input: { name?: string; definition?: WorkflowDefinition },
): Promise<{ workflow: Workflow }> {
  return apiFetch(`/api/v1/workflows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function publishWorkflow(id: string): Promise<{ workflow: Workflow }> {
  return apiFetch(`/api/v1/workflows/${id}/publish`, { method: "POST" });
}

export type Ticket = {
  id: string;
  orgId: string;
  typeId: string;
  typeName: string | null;
  title: string;
  description: unknown;
  statusId: string | null;
  statusName: string | null;
  priority: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  customerId: string | null;
  customFields: Record<string, unknown>;
  dueDate: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  conversationIds: string[];
};

export async function listTickets(params?: {
  statusId?: string;
  assigneeId?: string;
}): Promise<{ items: Ticket[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.statusId) q.set("statusId", params.statusId);
  if (params?.assigneeId) q.set("assigneeId", params.assigneeId);
  const qs = q.toString();
  return apiFetch(`/api/v1/tickets${qs ? `?${qs}` : ""}`);
}

export async function getTicket(id: string): Promise<{ ticket: Ticket }> {
  return apiFetch(`/api/v1/tickets/${id}`);
}

export async function createTicket(input: {
  title: string;
  priority?: string;
  conversationId?: string;
}): Promise<{ ticket: Ticket }> {
  return apiFetch("/api/v1/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTicket(
  id: string,
  patch: {
    title?: string;
    statusId?: string | null;
    priority?: string;
    assigneeId?: string | null;
  },
): Promise<{ ticket: Ticket }> {
  return apiFetch(`/api/v1/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function createTicketFromConversation(
  conversationId: string,
  title?: string,
): Promise<{ ticket: Ticket }> {
  return apiFetch(`/api/v1/conversations/${conversationId}/ticket`, {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export type TicketStatus = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  isDefault: boolean;
  sortOrder: number | null;
};

export type TicketEvent = {
  id: string;
  ticketId: string;
  eventType: string;
  actorId: string | null;
  payload: unknown;
  createdAt: string;
};

export async function listTicketStatuses(): Promise<{ items: TicketStatus[] }> {
  return apiFetch("/api/v1/tickets/meta/statuses");
}

export async function listTicketEvents(id: string): Promise<{ items: TicketEvent[] }> {
  return apiFetch(`/api/v1/tickets/${id}/events`);
}

export type MeResponse = {
  brandIds: string[];
  organization: { id: string; slug: string; name: string } | null;
};

export async function fetchMe(): Promise<MeResponse> {
  return apiFetch("/api/v1/me");
}

export type MemoryExplorerStats = {
  brandId: string;
  chunkCount: number;
  sourceCount: number;
  topicCount: number;
  hotTopicCount: number;
  storageBytes: number;
};

export type MemoryHotTopic = {
  userId: string;
  score: number;
  messageCount7d: number;
  openTicketCount: number;
};

export async function getMemoryStats(
  brandId: string,
): Promise<{ stats: MemoryExplorerStats; hotTopics: MemoryHotTopic[] }> {
  const qs = new URLSearchParams({ brandId });
  return apiFetch(`/api/v1/memory/stats?${qs}`);
}

export type MemoryDigest = {
  dateUtc: string;
  title: string | null;
  summary: string;
  keyEvents: string[];
};

export async function getMemoryDigest(
  brandId: string,
  date: string,
): Promise<{ digest: MemoryDigest }> {
  const qs = new URLSearchParams({ brandId, date });
  return apiFetch(`/api/v1/memory/digest?${qs}`);
}

export type MemorySearchHit = {
  chunkId: string;
  scope: "conversation" | "customer" | "channel" | "unknown";
  conversationId: string | null;
  messageId: string | null;
  userId: string | null;
  body: string;
  lifecycle: string;
  fastScore: number | null;
  ftsScore: number | null;
  vectorScore: number | null;
  fusedScore: number | null;
  sources: Array<"fts" | "vector">;
  snippet: string | null;
  createdAt: string;
};

export type MemorySummarySearchHit = {
  summaryId: string;
  scopeKey: string;
  level: number;
  kind: "seal" | "daily_digest";
  scope: "conversation" | "customer" | "channel" | "daily_digest" | "unknown";
  conversationId: string | null;
  userId: string | null;
  title: string | null;
  summary: string;
  ftsScore: number | null;
  snippet: string | null;
  sealedAt: string;
};

export async function searchMemory(input: {
  brandId: string;
  q: string;
  scope?: "all" | "conversation" | "customer" | "channel";
}): Promise<{ hits: MemorySearchHit[]; summaryHits: MemorySummarySearchHit[] }> {
  const qs = new URLSearchParams({
    brandId: input.brandId,
    q: input.q,
    scope: input.scope ?? "all",
  });
  const res = await apiFetch<{
    results: { hits: MemorySearchHit[]; summaryHits: MemorySummarySearchHit[] };
  }>(`/api/v1/memory/search?${qs}`);
  return { hits: res.results.hits, summaryHits: res.results.summaryHits };
}

export async function transitionTicketStatus(
  id: string,
  statusId: string,
): Promise<{ ticket: Ticket }> {
  return apiFetch(`/api/v1/tickets/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ statusId }),
  });
}
