import { createHash } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";

type WeComOAuthEnv = Pick<ApiEnv, "WECOM_SUITE_ID" | "WECOM_SUITE_OAUTH_REDIRECT_URI">;

export type WeComInstallation = {
  accountId: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export function wecomOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function wecomOAuthAuthorizeUrl(
  env: WeComOAuthEnv,
  state: string,
  suiteAccessToken: string,
): Promise<string> {
  const config = requireWeComOAuthConfig(env);
  const token = encodeURIComponent(suiteAccessToken);
  const preAuth = await requestWeComJson(
    `https://qyapi.weixin.qq.com/cgi-bin/service/get_pre_auth_code?suite_access_token=${token}`,
  );
  const preAuthCode = stringValue(preAuth.pre_auth_code);
  if (!preAuthCode) throw new Error("wecom_pre_auth_code_missing");
  await requestWeComJson(
    `https://qyapi.weixin.qq.com/cgi-bin/service/set_session_info?suite_access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pre_auth_code: preAuthCode, session_info: { auth_type: 0 } }),
    },
  );
  const url = new URL("https://open.work.weixin.qq.com/3rdapp/install");
  url.searchParams.set("suite_id", config.suiteId);
  url.searchParams.set("pre_auth_code", preAuthCode);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeWeComAuthorizationCode(
  env: WeComOAuthEnv,
  authCode: string,
  suiteAccessToken: string,
): Promise<WeComInstallation> {
  const config = requireWeComOAuthConfig(env);
  const payload = await requestWeComJson(
    `https://qyapi.weixin.qq.com/cgi-bin/service/get_permanent_code?suite_access_token=${encodeURIComponent(suiteAccessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: authCode }),
    },
  );
  const corp = record(payload.auth_corp_info);
  const authInfo = record(payload.auth_info);
  const agents = Array.isArray(authInfo?.agent) ? authInfo.agent.map(record).filter(Boolean) : [];
  const corpId = stringValue(corp?.corpid);
  const permanentCode = stringValue(payload.permanent_code);
  if (!corpId || !permanentCode) throw new Error("wecom_permanent_code_invalid");
  const agent = agents[0];
  const agentId = numberOrString(agent?.agentid);
  return {
    accountId: corpId,
    name: stringValue(corp?.corp_name) ?? `WeCom ${corpId}`,
    credentials: {
      appType: "isv",
      suiteId: config.suiteId,
      corpId,
      permanentCode,
      ...(agentId ? { agentId } : {}),
    },
    settings: {
      ...(agentId ? { agentId } : {}),
      corpType: stringValue(corp?.corp_type) ?? "",
    },
  };
}

function requireWeComOAuthConfig(env: WeComOAuthEnv) {
  if (!env.WECOM_SUITE_ID || !env.WECOM_SUITE_OAUTH_REDIRECT_URI) {
    throw new Error("wecom_oauth_not_configured");
  }
  return { suiteId: env.WECOM_SUITE_ID, redirectUri: env.WECOM_SUITE_OAUTH_REDIRECT_URI };
}

async function requestWeComJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const payload = record(await response.json().catch(() => null));
  if (!response.ok || !payload) throw new Error(`wecom_oauth_http_${response.status || 502}`);
  const errorCode = Number(payload.errcode);
  if (Number.isFinite(errorCode) && errorCode !== 0) {
    throw new Error(stringValue(payload.errmsg) ?? "wecom_oauth_provider_rejected");
  }
  return payload;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}
