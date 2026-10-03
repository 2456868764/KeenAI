import type { ApiEnv } from "@keenai/shared";
import type { ChannelConnectionRow } from "@keenai/storage/schema";
import { reconcileTelegramTransport } from "./telegram-webhook.js";

export type ChannelDisconnectResult = {
  mode: "remote" | "local_only";
  providerAction?: string;
};

export async function disconnectChannelProvider(
  connection: ChannelConnectionRow,
  credentials: Record<string, unknown>,
  env: ApiEnv,
): Promise<ChannelDisconnectResult> {
  if (connection.channelType === "slack") {
    return disconnectSlack(credentials, env);
  }
  if (connection.channelType === "discord") {
    return disconnectDiscord(connection.externalAccountId, credentials);
  }
  if (connection.channelType === "email") {
    return disconnectEmail(credentials);
  }
  if (connection.channelType === "whatsapp") {
    return disconnectWhatsApp(connection.externalAccountId, credentials, env);
  }
  if (connection.channelType === "telegram") {
    const botToken = stringValue(credentials.botToken);
    if (!botToken) return { mode: "local_only" };
    await reconcileTelegramTransport({ botToken, transport: "polling" });
    return { mode: "remote", providerAction: "deleteWebhook" };
  }
  if (
    (connection.channelType === "feishu" ||
      connection.channelType === "dingtalk" ||
      connection.channelType === "wecom") &&
    credentials.appType === "isv"
  ) {
    return { mode: "local_only", providerAction: "provider_admin_uninstall_required" };
  }
  return { mode: "local_only" };
}

async function disconnectSlack(
  credentials: Record<string, unknown>,
  env: ApiEnv,
): Promise<ChannelDisconnectResult> {
  const token = stringValue(credentials.botToken);
  if (!token || !env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    return { mode: "local_only" };
  }
  const response = await providerFetch("https://slack.com/api/apps.uninstall", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
    }),
  });
  const payload = await response.json().catch(() => null);
  const error = stringValue(record(payload)?.error);
  if (!response.ok || record(payload)?.ok !== true) {
    if (error === "token_revoked" || error === "account_inactive" || error === "invalid_auth") {
      return { mode: "remote", providerAction: "apps.uninstall.already_removed" };
    }
    throw new Error(`slack_disconnect_${error ?? "failed"}`);
  }
  return { mode: "remote", providerAction: "apps.uninstall" };
}

async function disconnectDiscord(
  guildId: string,
  credentials: Record<string, unknown>,
): Promise<ChannelDisconnectResult> {
  const botToken = stringValue(credentials.botToken);
  if (!botToken || !guildId || guildId === "default") return { mode: "local_only" };
  const response = await providerFetch(
    `https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(guildId)}`,
    { method: "DELETE", headers: { Authorization: `Bot ${botToken}` } },
  );
  if (response.status === 204 || response.status === 404) {
    return {
      mode: "remote",
      providerAction: response.status === 204 ? "guild.leave" : "guild.leave.already_removed",
    };
  }
  const payload = record(await response.json().catch(() => null));
  const code = stringValue(payload?.code);
  throw new Error(`discord_disconnect_${code ?? response.status}`);
}

async function disconnectEmail(
  credentials: Record<string, unknown>,
): Promise<ChannelDisconnectResult> {
  if (credentials.oauthProvider === "microsoft") {
    // Microsoft does not expose an endpoint that revokes only this app's refresh token.
    return { mode: "local_only", providerAction: "oauth.local_token_delete" };
  }
  if (credentials.oauthProvider !== "google") return { mode: "local_only" };
  const token = stringValue(credentials.refreshToken) ?? stringValue(credentials.accessToken);
  if (!token) return { mode: "local_only" };
  const response = await providerFetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (response.ok) return { mode: "remote", providerAction: "oauth.revoke" };
  const payload = record(await response.json().catch(() => null));
  if (payload?.error === "invalid_token") {
    return { mode: "remote", providerAction: "oauth.revoke.already_removed" };
  }
  throw new Error(`google_email_disconnect_${stringValue(payload?.error) ?? response.status}`);
}

async function disconnectWhatsApp(
  externalAccountId: string,
  credentials: Record<string, unknown>,
  env: ApiEnv,
): Promise<ChannelDisconnectResult> {
  const accessToken = stringValue(credentials.accessToken);
  const phoneNumberId =
    stringValue(credentials.phoneNumberId) ??
    (externalAccountId !== "default" ? externalAccountId : null);
  const graphApiVersion =
    stringValue(credentials.graphApiVersion) ?? env.WHATSAPP_GRAPH_API_VERSION;
  if (!accessToken || !phoneNumberId || !graphApiVersion) return { mode: "local_only" };
  const response = await providerFetch(
    `https://graph.facebook.com/${encodeURIComponent(graphApiVersion)}/${encodeURIComponent(phoneNumberId)}/deregister`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const payload = record(await response.json().catch(() => null));
  if (response.ok && payload?.success === true) {
    return { mode: "remote", providerAction: "phone_number.deregister" };
  }
  const error = record(payload?.error);
  throw new Error(
    `whatsapp_disconnect_${stringValue(error?.code) ?? stringValue(error?.type) ?? response.status}`,
  );
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("channel_disconnect_provider_unavailable");
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
