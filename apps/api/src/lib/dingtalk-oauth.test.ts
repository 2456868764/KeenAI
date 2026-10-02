import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import {
  createDingTalkOAuthState,
  dingtalkOAuthAuthorizeUrl,
  dingtalkOAuthStateHash,
  parseDingTalkOAuthState,
} from "./dingtalk-oauth.js";

describe("DingTalk administrator consent", () => {
  const env = parseApiEnv({
    DATABASE_URL: "file:test.db",
    DINGTALK_ISV_SUITE_KEY: "suite-key",
    DINGTALK_ISV_SUITE_SECRET: "suite-secret",
    DINGTALK_ISV_OAUTH_REDIRECT_URI:
      "https://api.example.com/api/v1/dashboard/channel-connections/dingtalk/oauth/callback",
  });

  it("binds a high-entropy OAuth state to the requested corp", () => {
    const state = createDingTalkOAuthState("ding-corp-1");
    expect(parseDingTalkOAuthState(state)).toEqual({ corpId: "ding-corp-1" });
    expect(dingtalkOAuthStateHash(state)).toMatch(/^[a-f0-9]{64}$/);
    expect(parseDingTalkOAuthState("invalid")).toBeNull();
  });

  it("builds the official App-Only administrator consent URL", () => {
    const state = createDingTalkOAuthState("ding-corp-1");
    const url = new URL(dingtalkOAuthAuthorizeUrl(env, "ding-corp-1", state));

    expect(url.origin).toBe("https://account.dingtalk.com");
    expect(url.pathname).toBe("/ding-corp-1/adminConsent");
    expect(url.searchParams.get("client_id")).toBe("suite-key");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/api/v1/dashboard/channel-connections/dingtalk/oauth/callback",
    );
    expect(url.searchParams.get("state")).toBe(state);
  });
});
