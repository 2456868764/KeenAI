import { createHash, randomUUID } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";
import type { Store } from "@keenai/storage";
import { type ChannelConnectionRow, channelConnections } from "@keenai/storage/schema";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";
import { hydrateDingTalkIsvCredentials } from "./dingtalk-isv.js";
import { loadEmailCredentials } from "./email-oauth.js";
import { hydrateFeishuIsvCredentials } from "./feishu-isv.js";
import { hydrateWeComIsvCredentials } from "./wecom-isv.js";

const SLACK_BOT_SCOPES = [
  "chat:write",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "files:read",
  "files:write",
  "reactions:read",
  "reactions:write",
  "app_mentions:read",
];

type SlackOAuthEnv = Pick<
  ApiEnv,
  "SLACK_CLIENT_ID" | "SLACK_CLIENT_SECRET" | "SLACK_SIGNING_SECRET" | "SLACK_OAUTH_REDIRECT_URI"
>;

export type SlackInstallation = {
  accountId: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export function slackOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function slackOAuthAuthorizeUrl(env: SlackOAuthEnv, state: string): string {
  const config = requireSlackOAuthConfig(env);
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSlackAuthorizationCode(
  env: SlackOAuthEnv,
  code: string,
): Promise<SlackInstallation> {
  const config = requireSlackOAuthConfig(env);
  const payload = await requestSlackOAuthToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  );
  const team = record(payload.team);
  const enterprise = record(payload.enterprise);
  const accountId = stringValue(team?.id) ?? stringValue(enterprise?.id);
  const botToken = stringValue(payload.access_token);
  if (!accountId || !botToken || payload.token_type !== "bot") {
    throw new Error("slack_oauth_response_invalid");
  }
  const refreshToken = stringValue(payload.refresh_token);
  const expiresIn = positiveSeconds(payload.expires_in);
  if (refreshToken && !expiresIn) throw new Error("slack_oauth_expiry_missing");
  return {
    accountId,
    name: stringValue(team?.name) ?? stringValue(enterprise?.name) ?? `Slack ${accountId}`,
    credentials: {
      botToken,
      signingSecret: config.signingSecret,
      ...(refreshToken && expiresIn
        ? { refreshToken, expiresAt: Date.now() + expiresIn * 1_000 }
        : {}),
    },
    settings: {
      scope: stringValue(payload.scope) ?? "",
      botUserId: stringValue(payload.bot_user_id) ?? "",
      appId: stringValue(payload.app_id) ?? "",
    },
  };
}

export async function loadChannelCredentials(
  store: Store,
  connection: ChannelConnectionRow,
  secret: string,
  env: ApiEnv,
): Promise<Record<string, unknown>> {
  if (connection.channelType === "email") {
    return loadEmailCredentials(store, connection, secret, env);
  }
  if (connection.channelType === "feishu") {
    return hydrateFeishuIsvCredentials({
      store,
      credentials: openChannelCredentials(connection.credentials, secret),
      secret,
      env,
      cacheScope: connection.id,
    });
  }
  if (connection.channelType === "wecom") {
    return hydrateWeComIsvCredentials({
      store,
      credentials: openChannelCredentials(connection.credentials, secret),
      secret,
      env,
      cacheScope: connection.id,
    });
  }
  if (connection.channelType === "dingtalk") {
    return hydrateDingTalkIsvCredentials({
      store,
      credentials: openChannelCredentials(connection.credentials, secret),
      secret,
      env,
      cacheScope: connection.id,
    });
  }
  if (connection.channelType !== "slack") {
    return openChannelCredentials(connection.credentials, secret);
  }
  const [fresh] = await store.db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connection.id))
    .limit(1);
  if (!fresh) throw new Error("channel_connection_not_found");
  const credentials = openChannelCredentials(fresh.credentials, secret);
  if (!needsSlackRefresh(credentials)) return credentials;
  return refreshSlackCredentials(store, fresh, credentials, secret, env);
}

async function refreshSlackCredentials(
  store: Store,
  connection: ChannelConnectionRow,
  credentials: Record<string, unknown>,
  secret: string,
  env: SlackOAuthEnv,
): Promise<Record<string, unknown>> {
  const config = requireSlackOAuthConfig(env);
  const refreshToken = stringValue(credentials.refreshToken);
  if (!refreshToken) return credentials;
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
  if (!claimed) return waitForSlackRefresh(store, connection.id, secret);

  try {
    const [current] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, connection.id))
      .limit(1);
    if (!current) throw new Error("channel_connection_not_found");
    const currentCredentials = openChannelCredentials(current.credentials, secret);
    if (!needsSlackRefresh(currentCredentials)) return currentCredentials;
    const currentRefreshToken = stringValue(currentCredentials.refreshToken);
    if (!currentRefreshToken) throw new Error("slack_oauth_refresh_token_missing");
    const payload = await requestSlackOAuthToken(
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
      }),
    );
    const botToken = stringValue(payload.access_token);
    const nextRefreshToken = stringValue(payload.refresh_token);
    const expiresIn = positiveSeconds(payload.expires_in);
    if (!botToken || !nextRefreshToken || !expiresIn) {
      throw new Error("slack_oauth_refresh_response_invalid");
    }
    const nextCredentials = {
      ...currentCredentials,
      botToken,
      refreshToken: nextRefreshToken,
      expiresAt: Date.now() + expiresIn * 1_000,
    };
    const [updated] = await store.db
      .update(channelConnections)
      .set({
        credentials: sealChannelCredentials(nextCredentials, secret),
        updatedAt: new Date(),
      })
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
      .set({
        credentialRefreshLeaseToken: null,
        credentialRefreshLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.credentialRefreshLeaseToken, leaseToken),
        ),
      );
  }
}

async function waitForSlackRefresh(
  store: Store,
  connectionId: string,
  secret: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [row] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, connectionId))
      .limit(1);
    if (!row) throw new Error("channel_connection_not_found");
    const credentials = openChannelCredentials(row.credentials, secret);
    if (!needsSlackRefresh(credentials)) return credentials;
    if (!row.credentialRefreshLeaseToken) throw new Error("slack_oauth_refresh_failed");
  }
  throw new Error("slack_oauth_refresh_in_progress");
}

function needsSlackRefresh(credentials: Record<string, unknown>): boolean {
  if (!stringValue(credentials.refreshToken)) return false;
  const expiresAt = Number(credentials.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000;
}

function requireSlackOAuthConfig(env: SlackOAuthEnv) {
  if (
    !env.SLACK_CLIENT_ID ||
    !env.SLACK_CLIENT_SECRET ||
    !env.SLACK_SIGNING_SECRET ||
    !env.SLACK_OAUTH_REDIRECT_URI
  ) {
    throw new Error("slack_oauth_not_configured");
  }
  return {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
    signingSecret: env.SLACK_SIGNING_SECRET,
    redirectUri: env.SLACK_OAUTH_REDIRECT_URI,
  };
}

async function requestSlackOAuthToken(form: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !record(payload) || payload.ok !== true) {
    throw new Error(`slack_oauth_${stringValue(record(payload)?.error) ?? "exchange_failed"}`);
  }
  return payload;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function positiveSeconds(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}
