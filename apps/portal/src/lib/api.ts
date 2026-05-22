import { getPortalSession } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";

export type PortalTicket = {
  id: string;
  title: string;
  statusName: string | null;
  priority: string | null;
  updatedAt: string;
  closedAt: string | null;
};

export function getApiUrl(): string {
  return API_URL;
}

async function portalFetch<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = init?.token ?? getPortalSession()?.accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

export async function requestPortalMagicLink(orgSlug: string, email: string): Promise<void> {
  await portalFetch(`/api/v1/portal/${encodeURIComponent(orgSlug)}/magic-link`, {
    method: "POST",
    body: JSON.stringify({ email }),
    token: null,
  });
}

export async function verifyPortalMagicLink(
  orgSlug: string,
  token: string,
): Promise<{ accessToken: string; customerId: string; orgSlug: string }> {
  return portalFetch(`/api/v1/portal/${encodeURIComponent(orgSlug)}/magic-link/verify`, {
    method: "POST",
    body: JSON.stringify({ token }),
    token: null,
  });
}

export async function listPortalTickets(
  orgSlug: string,
  opts?: { customerId?: string; token?: string | null },
): Promise<{ items: PortalTicket[] }> {
  const qs = new URLSearchParams();
  if (opts?.customerId) qs.set("customerId", opts.customerId);
  const query = qs.toString();
  return portalFetch(
    `/api/v1/portal/${encodeURIComponent(orgSlug)}/tickets${query ? `?${query}` : ""}`,
    { token: opts?.token },
  );
}
