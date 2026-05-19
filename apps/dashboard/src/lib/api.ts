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
  opts?: { isInternal?: boolean },
): Promise<{ message: Message }> {
  return apiFetch(`/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ plainText, isInternal: opts?.isInternal ?? false }),
  });
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
