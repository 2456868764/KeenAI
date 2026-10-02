import { createHash, randomBytes } from "node:crypto";
import type { ApiEnv } from "@keenai/shared";
import { getDingTalkIsvCorpAccessToken } from "./channel-provider-tokens.js";

type DingTalkOAuthEnv = Pick<
  ApiEnv,
  "DINGTALK_ISV_SUITE_KEY" | "DINGTALK_ISV_SUITE_SECRET" | "DINGTALK_ISV_OAUTH_REDIRECT_URI"
>;

export type DingTalkInstallation = {
  accountId: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export function createDingTalkOAuthState(corpId: string): string {
  return `${randomBytes(32).toString("base64url")}.${Buffer.from(corpId).toString("base64url")}`;
}

export function parseDingTalkOAuthState(state: string): { corpId: string } | null {
  const separator = state.lastIndexOf(".");
  if (separator < 32) return null;
  try {
    const corpId = Buffer.from(state.slice(separator + 1), "base64url")
      .toString("utf8")
      .trim();
    return corpId && corpId.length <= 255 ? { corpId } : null;
  } catch {
    return null;
  }
}

export function dingtalkOAuthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function dingtalkOAuthAuthorizeUrl(
  env: DingTalkOAuthEnv,
  corpId: string,
  state: string,
): string {
  const config = requireDingTalkOAuthConfig(env);
  const url = new URL(`https://account.dingtalk.com/${encodeURIComponent(corpId)}/adminConsent`);
  url.searchParams.set("client_id", config.suiteKey);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeDingTalkAdminConsent(input: {
  env: DingTalkOAuthEnv;
  corpId: string;
  suiteTicket: string;
}): Promise<DingTalkInstallation> {
  const config = requireDingTalkOAuthConfig(input.env);
  await getDingTalkIsvCorpAccessToken(
    {
      suiteKey: config.suiteKey,
      suiteSecret: config.suiteSecret,
      suiteTicket: input.suiteTicket,
      authCorpId: input.corpId,
    },
    `oauth:${input.corpId}`,
  );
  return {
    accountId: input.corpId,
    name: `DingTalk ${input.corpId}`,
    credentials: {
      appType: "isv",
      suiteKey: config.suiteKey,
      corpId: input.corpId,
    },
    settings: { appType: "isv", suiteKey: config.suiteKey },
  };
}

function requireDingTalkOAuthConfig(env: DingTalkOAuthEnv) {
  if (
    !env.DINGTALK_ISV_SUITE_KEY ||
    !env.DINGTALK_ISV_SUITE_SECRET ||
    !env.DINGTALK_ISV_OAUTH_REDIRECT_URI
  ) {
    throw new Error("dingtalk_oauth_not_configured");
  }
  return {
    suiteKey: env.DINGTALK_ISV_SUITE_KEY,
    suiteSecret: env.DINGTALK_ISV_SUITE_SECRET,
    redirectUri: env.DINGTALK_ISV_OAUTH_REDIRECT_URI,
  };
}
