import type { WidgetMessagePayload, WidgetUser } from "./types.js";

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

export type WidgetMessage = WidgetMessagePayload & {
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
