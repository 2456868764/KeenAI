import { createHash } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";

type DiscordOAuthEnv = Pick<
  ApiEnv,
  | "DISCORD_CLIENT_ID"
  | "DISCORD_CLIENT_SECRET"
  | "DISCORD_BOT_TOKEN"
  | "DISCORD_PUBLIC_KEY"
  | "DISCORD_OAUTH_REDIRECT_URI"
  | "DISCORD_BOT_PERMISSIONS"
>;

// View Channel, Send Messages, Embed Links, Attach Files, Read Message History,
// Add Reactions, and Send Messages in Threads.
export const DEFAULT_DISCORD_BOT_PERMISSIONS = "274878024768";

export type DiscordInstallation = {
  accountId: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export function discordOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function discordOAuthAuthorizeUrl(env: DiscordOAuthEnv, state: string): string {
  const config = requireDiscordOAuthConfig(env);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: "bot applications.commands identify",
    state,
    redirect_uri: config.redirectUri,
    prompt: "consent",
    integration_type: "0",
    ...(config.permissions ? { permissions: config.permissions } : {}),
  }).toString();
  return url.toString();
}

export async function exchangeDiscordAuthorizationCode(
  env: DiscordOAuthEnv,
  code: string,
): Promise<DiscordInstallation> {
  const config = requireDiscordOAuthConfig(env);
  const token = await discordJson("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  const guildHint = record(token.guild);
  const guildId = stringValue(guildHint?.id);
  const accessToken = stringValue(token.access_token);
  const refreshToken = stringValue(token.refresh_token);
  const expiresIn = positiveNumber(token.expires_in);
  if (!guildId || !accessToken || !refreshToken || !expiresIn) {
    throw new Error("discord_oauth_response_invalid");
  }

  const guild = await discordJson(
    `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}`,
    { headers: { Authorization: `Bot ${config.botToken}` } },
  );
  if (stringValue(guild.id) !== guildId) throw new Error("discord_oauth_guild_mismatch");
  return {
    accountId: guildId,
    name: stringValue(guild.name) ?? stringValue(guildHint?.name) ?? `Discord ${guildId}`,
    credentials: {
      botToken: config.botToken,
      publicKey: config.publicKey,
      oauthAccessToken: accessToken,
      oauthRefreshToken: refreshToken,
      oauthExpiresAt: Date.now() + expiresIn * 1_000,
    },
    settings: {
      guildId,
      oauthScope: stringValue(token.scope) ?? "",
      permissions: stringValue(token.permissions) ?? config.permissions ?? "",
    },
  };
}

function requireDiscordOAuthConfig(env: DiscordOAuthEnv) {
  if (
    !env.DISCORD_CLIENT_ID ||
    !env.DISCORD_CLIENT_SECRET ||
    !env.DISCORD_BOT_TOKEN ||
    !env.DISCORD_PUBLIC_KEY ||
    !env.DISCORD_OAUTH_REDIRECT_URI
  ) {
    throw new Error("discord_oauth_not_configured");
  }
  return {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    botToken: env.DISCORD_BOT_TOKEN,
    publicKey: env.DISCORD_PUBLIC_KEY,
    redirectUri: env.DISCORD_OAUTH_REDIRECT_URI,
    permissions: env.DISCORD_BOT_PERMISSIONS ?? DEFAULT_DISCORD_BOT_PERMISSIONS,
  };
}

async function discordJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("discord_oauth_provider_unavailable");
  }
  const payload = record(await response.json().catch(() => null));
  if (!response.ok) {
    const code = payload ? (stringValue(payload.code) ?? String(payload.code ?? "")) : "";
    throw new Error(code ? `discord_oauth_provider_${code}` : "discord_oauth_provider_rejected");
  }
  if (!payload) throw new Error("discord_oauth_response_invalid");
  return payload;
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

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
