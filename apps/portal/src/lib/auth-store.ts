const SESSION_KEY = "keenai_portal_session";

export type PortalSession = {
  accessToken: string;
  customerId: string;
  orgSlug: string;
};

export function getPortalSession(): PortalSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalSession;
  } catch {
    return null;
  }
}

export function setPortalSession(session: PortalSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearPortalSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
