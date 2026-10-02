import { createHash } from "node:crypto";

type TokenCredentials = Record<string, unknown>;

type TokenResult = {
  token: string;
  expiresInSeconds: number;
};

type CacheEntry = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, CacheEntry>();
const tokenLoads = new Map<string, Promise<string>>();
const EXPIRY_SKEW_MS = 60_000;
const DEFAULT_TOKEN_TTL_SECONDS = 7_200;

export class ProviderTokenError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderTokenError";
  }
}

export async function getFeishuTenantAccessToken(
  credentials: TokenCredentials,
  cacheScope = "default",
): Promise<string> {
  const appId = optionalCredential(credentials, "appId");
  const appSecret = optionalCredential(credentials, "appSecret");
  if (!appId || !appSecret) return requiredCredential(credentials, "tenantAccessToken", "feishu");
  return cachedToken("feishu", cacheScope, [appId, appSecret], async () => {
    const payload = await providerJson(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
    );
    if (numberValue(payload.code) !== undefined && numberValue(payload.code) !== 0) {
      throw new ProviderTokenError(401, stringValue(payload.msg) ?? "feishu_token_exchange_failed");
    }
    return {
      token: requiredToken(payload.tenant_access_token, "feishu_token_exchange_failed"),
      expiresInSeconds: positiveSeconds(payload.expire) ?? DEFAULT_TOKEN_TTL_SECONDS,
    };
  });
}

export async function getFeishuIsvTenantAccessToken(
  credentials: {
    appId: string;
    appSecret: string;
    appTicket: string;
    tenantKey: string;
  },
  cacheScope = "default",
): Promise<string> {
  const { appId, appSecret, appTicket, tenantKey } = credentials;
  if (!appId || !appSecret || !appTicket || !tenantKey) {
    throw new ProviderTokenError(400, "feishu_isv_credentials_missing");
  }
  return cachedToken(
    "feishu-isv",
    cacheScope,
    [appId, appSecret, appTicket, tenantKey],
    async () => {
      const appPayload = await providerJson(
        "https://open.feishu.cn/open-apis/auth/v3/app_access_token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret, app_ticket: appTicket }),
        },
      );
      assertFeishuSuccess(appPayload, "feishu_app_token_exchange_failed");
      const appData = responseData(appPayload);
      const appAccessToken = requiredToken(
        appData.app_access_token,
        "feishu_app_token_exchange_failed",
      );

      const tenantPayload = await providerJson(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_access_token: appAccessToken, tenant_key: tenantKey }),
        },
      );
      assertFeishuSuccess(tenantPayload, "feishu_tenant_token_exchange_failed");
      const tenantData = responseData(tenantPayload);
      return {
        token: requiredToken(tenantData.tenant_access_token, "feishu_tenant_token_exchange_failed"),
        expiresInSeconds:
          positiveSeconds(tenantData.expire) ??
          positiveSeconds(tenantData.expires_in) ??
          DEFAULT_TOKEN_TTL_SECONDS,
      };
    },
  );
}

export async function getDingTalkAccessToken(
  credentials: TokenCredentials,
  cacheScope = "default",
): Promise<string> {
  const accessToken = optionalCredential(credentials, "accessToken");
  if (accessToken) return accessToken;
  const appKey = optionalCredential(credentials, "appKey");
  const appSecret = optionalCredential(credentials, "appSecret");
  if (!appKey || !appSecret) return requiredCredential(credentials, "accessToken", "dingtalk");
  return cachedToken("dingtalk", cacheScope, [appKey, appSecret], async () => {
    const payload = await providerJson("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appKey, appSecret }),
    });
    return {
      token: requiredToken(payload.accessToken, "dingtalk_token_exchange_failed"),
      expiresInSeconds: positiveSeconds(payload.expireIn) ?? DEFAULT_TOKEN_TTL_SECONDS,
    };
  });
}

export async function getDingTalkIsvCorpAccessToken(
  credentials: {
    suiteKey: string;
    suiteSecret: string;
    suiteTicket: string;
    authCorpId: string;
  },
  cacheScope = "default",
): Promise<string> {
  const { suiteKey, suiteSecret, suiteTicket, authCorpId } = credentials;
  if (!suiteKey || !suiteSecret || !suiteTicket || !authCorpId) {
    throw new ProviderTokenError(400, "dingtalk_isv_credentials_missing");
  }
  return cachedToken(
    "dingtalk-isv-corp",
    cacheScope,
    [suiteKey, suiteSecret, suiteTicket, authCorpId],
    async () => {
      const payload = await providerJson("https://api.dingtalk.com/v1.0/oauth2/corpAccessToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suiteKey, suiteSecret, suiteTicket, authCorpId }),
      });
      return {
        token: requiredToken(payload.accessToken, "dingtalk_isv_token_exchange_failed"),
        expiresInSeconds: positiveSeconds(payload.expireIn) ?? DEFAULT_TOKEN_TTL_SECONDS,
      };
    },
  );
}

export async function getWeChatAccessToken(
  credentials: TokenCredentials,
  cacheScope = "default",
): Promise<string> {
  const accessToken = optionalCredential(credentials, "accessToken");
  if (accessToken) return accessToken;
  const appId = optionalCredential(credentials, "appId");
  const appSecret = optionalCredential(credentials, "appSecret");
  if (!appId || !appSecret) return requiredCredential(credentials, "accessToken", "wechat");
  return cachedToken("wechat", cacheScope, [appId, appSecret], async () => {
    const payload = await providerJson("https://api.weixin.qq.com/cgi-bin/stable_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credential",
        appid: appId,
        secret: appSecret,
        force_refresh: false,
      }),
    });
    const errorCode = numberValue(payload.errcode);
    if (errorCode !== undefined && errorCode !== 0) {
      throw new ProviderTokenError(
        401,
        stringValue(payload.errmsg) ?? "wechat_token_exchange_failed",
      );
    }
    return {
      token: requiredToken(payload.access_token, "wechat_token_exchange_failed"),
      expiresInSeconds: positiveSeconds(payload.expires_in) ?? DEFAULT_TOKEN_TTL_SECONDS,
    };
  });
}

export async function getWeComAccessToken(
  credentials: TokenCredentials,
  cacheScope = "default",
): Promise<string> {
  const corpId = optionalCredential(credentials, "corpId");
  const corpSecret = optionalCredential(credentials, "corpSecret");
  if (!corpId || !corpSecret) return requiredCredential(credentials, "accessToken", "wecom");
  return cachedToken("wecom", cacheScope, [corpId, corpSecret], async () => {
    const payload = await providerJson(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`,
    );
    const errorCode = numberValue(payload.errcode);
    if (errorCode !== undefined && errorCode !== 0) {
      throw new ProviderTokenError(
        401,
        stringValue(payload.errmsg) ?? "wecom_token_exchange_failed",
      );
    }
    return {
      token: requiredToken(payload.access_token, "wecom_token_exchange_failed"),
      expiresInSeconds: positiveSeconds(payload.expires_in) ?? DEFAULT_TOKEN_TTL_SECONDS,
    };
  });
}

export async function getWeComSuiteAccessToken(
  credentials: { suiteId: string; suiteSecret: string; suiteTicket: string },
  cacheScope = "default",
): Promise<string> {
  const { suiteId, suiteSecret, suiteTicket } = credentials;
  if (!suiteId || !suiteSecret || !suiteTicket) {
    throw new ProviderTokenError(400, "wecom_suite_credentials_missing");
  }
  return cachedToken("wecom-suite", cacheScope, [suiteId, suiteSecret, suiteTicket], async () => {
    const payload = await providerJson(
      "https://qyapi.weixin.qq.com/cgi-bin/service/get_suite_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suite_id: suiteId,
          suite_secret: suiteSecret,
          suite_ticket: suiteTicket,
        }),
      },
    );
    assertWeComSuccess(payload, "wecom_suite_token_exchange_failed");
    return {
      token: requiredToken(payload.suite_access_token, "wecom_suite_token_exchange_failed"),
      expiresInSeconds: positiveSeconds(payload.expires_in) ?? DEFAULT_TOKEN_TTL_SECONDS,
    };
  });
}

export async function getWeComCorpAccessToken(
  credentials: { suiteAccessToken: string; authCorpId: string; permanentCode: string },
  cacheScope = "default",
): Promise<string> {
  const { suiteAccessToken, authCorpId, permanentCode } = credentials;
  if (!suiteAccessToken || !authCorpId || !permanentCode) {
    throw new ProviderTokenError(400, "wecom_corp_credentials_missing");
  }
  return cachedToken(
    "wecom-corp",
    cacheScope,
    [suiteAccessToken, authCorpId, permanentCode],
    async () => {
      const payload = await providerJson(
        `https://qyapi.weixin.qq.com/cgi-bin/service/get_corp_token?suite_access_token=${encodeURIComponent(suiteAccessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auth_corpid: authCorpId, permanent_code: permanentCode }),
        },
      );
      assertWeComSuccess(payload, "wecom_corp_token_exchange_failed");
      return {
        token: requiredToken(payload.access_token, "wecom_corp_token_exchange_failed"),
        expiresInSeconds: positiveSeconds(payload.expires_in) ?? DEFAULT_TOKEN_TTL_SECONDS,
      };
    },
  );
}

export function resetProviderTokenCacheForTests(): void {
  tokenCache.clear();
  tokenLoads.clear();
}

async function cachedToken(
  provider: string,
  cacheScope: string,
  credentialParts: string[],
  load: () => Promise<TokenResult>,
): Promise<string> {
  const fingerprint = createHash("sha256").update(credentialParts.join("\0")).digest("base64url");
  const key = `${provider}:${cacheScope}:${fingerprint}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + EXPIRY_SKEW_MS) return cached.token;
  const active = tokenLoads.get(key);
  if (active) return active;
  const pending = load()
    .then((result) => {
      tokenCache.set(key, {
        token: result.token,
        expiresAt: Date.now() + Math.max(result.expiresInSeconds, 1) * 1_000,
      });
      return result.token;
    })
    .finally(() => tokenLoads.delete(key));
  tokenLoads.set(key, pending);
  return pending;
}

async function providerJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    throw new ProviderTokenError(
      response.status || 502,
      `provider_token_http_${response.status || 502}`,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined,
    );
  }
  return payload;
}

function requiredCredential(credentials: TokenCredentials, key: string, provider: string): string {
  const value = optionalCredential(credentials, key);
  if (!value) throw new ProviderTokenError(400, `${provider}_credentials_missing`);
  return value;
}

function optionalCredential(credentials: TokenCredentials, key: string): string | undefined {
  const value = credentials[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredToken(value: unknown, errorCode: string): string {
  const token = stringValue(value);
  if (!token) throw new ProviderTokenError(401, errorCode);
  return token;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveSeconds(value: unknown): number | undefined {
  const number = numberValue(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function assertFeishuSuccess(payload: Record<string, unknown>, fallback: string): void {
  const code = numberValue(payload.code);
  if (code !== undefined && code !== 0) {
    throw new ProviderTokenError(401, stringValue(payload.msg) ?? fallback);
  }
}

function assertWeComSuccess(payload: Record<string, unknown>, fallback: string): void {
  const code = numberValue(payload.errcode);
  if (code !== undefined && code !== 0) {
    throw new ProviderTokenError(401, stringValue(payload.errmsg) ?? fallback);
  }
}

function responseData(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.data) ? payload.data : payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
