import type { WidgetUser } from "./types.js";

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
};

export type WidgetMessage = {
  id: string;
  plainText: string;
  senderType: string;
  createdAt: string;
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
