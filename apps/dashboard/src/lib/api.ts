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
  },
): Promise<{ message: Message }> {
  return apiFetch(`/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      plainText,
      isInternal: opts?.isInternal ?? false,
      content: opts?.content ? { type: "tiptap", doc: opts.content.doc } : undefined,
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

/** Stream copilot draft via SSE; calls onChunk for each text delta. */
export async function streamCopilotDraft(
  conversationId: string,
  instruction: string | undefined,
  onChunk: (text: string) => void,
): Promise<{ providerId: string }> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}/api/v1/copilot/draft`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId, instruction }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(parseApiError(body, `Copilot failed (${res.status})`));
  }

  let providerId = "stub";
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
        providerId = meta.providerId;
      } else if (data && event !== "done") {
        const payload = JSON.parse(data) as { text?: string };
        if (payload.text) onChunk(payload.text);
      }
    }
  }

  return { providerId };
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
