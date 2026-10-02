import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";
import type { Store } from "@keenai/storage";
import { type ChannelConnectionRow, channelConnections } from "@keenai/storage/schema";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";

type EmailOAuthEnv = Pick<
  ApiEnv,
  | "EMAIL_GOOGLE_CLIENT_ID"
  | "EMAIL_GOOGLE_CLIENT_SECRET"
  | "EMAIL_MICROSOFT_CLIENT_ID"
  | "EMAIL_MICROSOFT_CLIENT_SECRET"
  | "EMAIL_OAUTH_REDIRECT_URI"
>;

export type EmailOAuthProvider = "google" | "microsoft";

export function emailOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function createEmailOAuthState(provider: EmailOAuthProvider, email: string): string {
  return `${randomBytes(32).toString("base64url")}.${Buffer.from(JSON.stringify({ provider, email })).toString("base64url")}`;
}

export function parseEmailOAuthState(
  state: string,
): { provider: EmailOAuthProvider; email: string } | null {
  const [, encoded, extra] = state.split(".");
  if (!encoded || extra || state.length > 1024) return null;
  try {
    const value = record(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    const provider = value?.provider;
    const email = stringValue(value?.email);
    return (provider === "google" || provider === "microsoft") && email && isEmail(email)
      ? { provider, email }
      : null;
  } catch {
    return null;
  }
}

export function emailOAuthAuthorizeUrl(
  env: EmailOAuthEnv,
  provider: EmailOAuthProvider,
  email: string,
  state: string,
): string {
  const client = clientConfig(env, provider);
  const redirectUri = redirectConfig(env);
  const url = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  url.searchParams.set("client_id", client.id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    provider === "google"
      ? "https://mail.google.com/"
      : "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
  );
  if (provider === "google") url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("login_hint", email);
  return url.toString();
}

export async function exchangeEmailAuthorizationCode(
  env: EmailOAuthEnv,
  provider: EmailOAuthProvider,
  code: string,
): Promise<Record<string, unknown>> {
  const client = clientConfig(env, provider);
  const response = await fetch(client.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectConfig(env),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  const data = record(payload);
  const accessToken = stringValue(data?.access_token);
  const refreshToken = stringValue(data?.refresh_token);
  const expiresIn = Number(data?.expires_in);
  if (
    !response.ok ||
    !accessToken ||
    !refreshToken ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("email_oauth_exchange_failed");
  }
  return {
    oauthProvider: provider,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1_000,
  };
}

export function emailOAuthConnectionSettings(provider: EmailOAuthProvider, email: string) {
  if (!isEmail(email)) throw new Error("email_oauth_email_invalid");
  return provider === "google"
    ? {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: email,
        from: email,
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: email,
        imapMailbox: "INBOX",
      }
    : {
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        user: email,
        from: email,
        imapHost: "outlook.office365.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: email,
        imapMailbox: "INBOX",
      };
}

export async function loadEmailCredentials(
  store: Store,
  connection: ChannelConnectionRow,
  secret: string,
  env: EmailOAuthEnv,
): Promise<Record<string, unknown>> {
  const [fresh] = await store.db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connection.id))
    .limit(1);
  if (!fresh) throw new Error("channel_connection_not_found");
  const credentials = openChannelCredentials(fresh.credentials, secret);
  if (!needsRefresh(credentials)) return credentials;
  const provider = credentials.oauthProvider;
  const refreshToken = stringValue(credentials.refreshToken);
  if (!refreshToken || (provider !== "google" && provider !== "microsoft")) {
    throw new Error("email_oauth_refresh_not_configured");
  }
  const client = clientConfig(env, provider);
  const now = new Date();
  const leaseToken = randomUUID();
  const [claimed] = await store.db
    .update(channelConnections)
    .set({
      credentialRefreshLeaseToken: leaseToken,
      credentialRefreshLeaseExpiresAt: new Date(now.getTime() + 30_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(channelConnections.id, connection.id),
        or(
          isNull(channelConnections.credentialRefreshLeaseExpiresAt),
          lte(channelConnections.credentialRefreshLeaseExpiresAt, now),
        ),
      ),
    )
    .returning({ id: channelConnections.id });
  if (!claimed) return waitForRefresh(store, connection.id, secret);

  try {
    const [current] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, connection.id))
      .limit(1);
    if (!current) throw new Error("channel_connection_not_found");
    const currentCredentials = openChannelCredentials(current.credentials, secret);
    if (!needsRefresh(currentCredentials)) return currentCredentials;
    const currentRefreshToken = stringValue(currentCredentials.refreshToken);
    if (!currentRefreshToken) throw new Error("email_oauth_refresh_token_missing");
    const response = await fetch(client.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.id,
        client_secret: client.secret,
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    const data = record(payload);
    const accessToken = stringValue(data?.access_token);
    const expiresIn = Number(data?.expires_in);
    if (!response.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("email_oauth_refresh_failed");
    }
    const nextCredentials = {
      ...currentCredentials,
      accessToken,
      refreshToken: stringValue(data?.refresh_token) ?? currentRefreshToken,
      expiresAt: Date.now() + expiresIn * 1_000,
    };
    const [updated] = await store.db
      .update(channelConnections)
      .set({ credentials: sealChannelCredentials(nextCredentials, secret), updatedAt: new Date() })
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.credentialRefreshLeaseToken, leaseToken),
          eq(channelConnections.credentials, current.credentials),
        ),
      )
      .returning({ id: channelConnections.id });
    if (updated) return nextCredentials;
    const [latest] = await store.db
      .select({ credentials: channelConnections.credentials })
      .from(channelConnections)
      .where(eq(channelConnections.id, connection.id))
      .limit(1);
    if (!latest) throw new Error("channel_connection_not_found");
    return openChannelCredentials(latest.credentials, secret);
  } finally {
    await store.db
      .update(channelConnections)
      .set({ credentialRefreshLeaseToken: null, credentialRefreshLeaseExpiresAt: null })
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.credentialRefreshLeaseToken, leaseToken),
        ),
      );
  }
}

async function waitForRefresh(store: Store, id: string, secret: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [row] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, id))
      .limit(1);
    if (!row) throw new Error("channel_connection_not_found");
    const credentials = openChannelCredentials(row.credentials, secret);
    if (!needsRefresh(credentials)) return credentials;
    if (!row.credentialRefreshLeaseToken) throw new Error("email_oauth_refresh_failed");
  }
  throw new Error("email_oauth_refresh_in_progress");
}

function needsRefresh(credentials: Record<string, unknown>): boolean {
  if (!stringValue(credentials.accessToken)) return false;
  const expiresAt = Number(credentials.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000;
}

function clientConfig(env: EmailOAuthEnv, provider: "google" | "microsoft") {
  const id = provider === "google" ? env.EMAIL_GOOGLE_CLIENT_ID : env.EMAIL_MICROSOFT_CLIENT_ID;
  const secret =
    provider === "google" ? env.EMAIL_GOOGLE_CLIENT_SECRET : env.EMAIL_MICROSOFT_CLIENT_SECRET;
  if (!id || !secret) throw new Error("email_oauth_client_not_configured");
  return {
    id,
    secret,
    tokenUrl:
      provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  };
}

function redirectConfig(env: EmailOAuthEnv): string {
  if (!env.EMAIL_OAUTH_REDIRECT_URI) throw new Error("email_oauth_redirect_not_configured");
  return env.EMAIL_OAUTH_REDIRECT_URI;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
