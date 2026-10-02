import { createHash } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";
import { getFeishuIsvTenantAccessToken } from "./channel-provider-tokens.js";

type FeishuOAuthEnv = Pick<
  ApiEnv,
  "FEISHU_ISV_APP_ID" | "FEISHU_ISV_APP_SECRET" | "FEISHU_ISV_OAUTH_REDIRECT_URI"
>;

export type FeishuInstallation = {
  accountId: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export function feishuOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function feishuOAuthAuthorizeUrl(env: FeishuOAuthEnv, state: string): string {
  const config = requireFeishuOAuthConfig(env);
  const url = new URL("https://open.feishu.cn/open-apis/authen/v1/authorize");
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeFeishuAuthorizationCode(
  env: FeishuOAuthEnv,
  code: string,
  appTicket: string,
): Promise<FeishuInstallation> {
  const config = requireFeishuOAuthConfig(env);
  const tokenPayload = await requestJson("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  assertFeishuSuccess(tokenPayload, "feishu_oauth_exchange_failed");
  const tokenData = responseData(tokenPayload);
  const userAccessToken = stringValue(tokenData.access_token);
  if (!userAccessToken) throw new Error("feishu_oauth_access_token_missing");

  const userPayload = await requestJson("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  assertFeishuSuccess(userPayload, "feishu_oauth_user_info_failed");
  const user = responseData(userPayload);
  const tenantKey = stringValue(user.tenant_key) ?? stringValue(tokenData.tenant_key);
  if (!tenantKey) throw new Error("feishu_oauth_tenant_key_missing");

  const tenantAccessToken = await getFeishuIsvTenantAccessToken(
    {
      appId: config.appId,
      appSecret: config.appSecret,
      appTicket,
      tenantKey,
    },
    `oauth:${tenantKey}`,
  );
  const botPayload = await requestJson("https://open.feishu.cn/open-apis/bot/v3/info", {
    headers: { Authorization: `Bearer ${tenantAccessToken}` },
  });
  assertFeishuSuccess(botPayload, "feishu_bot_info_failed");
  const bot = record(botPayload.bot) ?? record(responseData(botPayload).bot);
  const botOpenId = stringValue(bot?.open_id);
  if (!botOpenId) throw new Error("feishu_bot_info_invalid");

  return {
    accountId: tenantKey,
    name: stringValue(bot?.app_name) ?? stringValue(user.name) ?? `Feishu ${tenantKey}`,
    credentials: { appType: "isv", appId: config.appId, tenantKey },
    settings: {
      botOpenId,
      installerOpenId: stringValue(user.open_id) ?? "",
      installerName: stringValue(user.name) ?? "",
    },
  };
}

function requireFeishuOAuthConfig(env: FeishuOAuthEnv) {
  if (!env.FEISHU_ISV_APP_ID || !env.FEISHU_ISV_APP_SECRET || !env.FEISHU_ISV_OAUTH_REDIRECT_URI) {
    throw new Error("feishu_oauth_not_configured");
  }
  return {
    appId: env.FEISHU_ISV_APP_ID,
    appSecret: env.FEISHU_ISV_APP_SECRET,
    redirectUri: env.FEISHU_ISV_OAUTH_REDIRECT_URI,
  };
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => null);
  const result = record(payload);
  if (!response.ok || !result) throw new Error(`feishu_oauth_http_${response.status || 502}`);
  return result;
}

function assertFeishuSuccess(payload: Record<string, unknown>, fallback: string): void {
  const code = Number(payload.code);
  if (Number.isFinite(code) && code !== 0) throw new Error(stringValue(payload.msg) ?? fallback);
}

function responseData(payload: Record<string, unknown>): Record<string, unknown> {
  return record(payload.data) ?? payload;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
