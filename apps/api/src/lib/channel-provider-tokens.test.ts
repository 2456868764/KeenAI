import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDingTalkAccessToken,
  getDingTalkIsvCorpAccessToken,
  getFeishuIsvTenantAccessToken,
  getFeishuTenantAccessToken,
  getWeChatAccessToken,
  getWeComAccessToken,
  getWeComCorpAccessToken,
  getWeComSuiteAccessToken,
  resetProviderTokenCacheForTests,
} from "./channel-provider-tokens.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetProviderTokenCacheForTests();
});

describe("channel provider token broker", () => {
  it("coalesces concurrent Feishu token loads and refreshes before expiry", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: "token-1", expire: 120 }))
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, tenant_access_token: "token-2", expire: 120 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const credentials = { appId: "app-1", appSecret: "secret-1" };

    const [first, second] = await Promise.all([
      getFeishuTenantAccessToken(credentials, "connection-1"),
      getFeishuTenantAccessToken(credentials, "connection-1"),
    ]);
    expect(first).toBe("token-1");
    expect(second).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 61_000;
    await expect(getFeishuTenantAccessToken(credentials, "connection-1")).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses configured tokens without a provider request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getFeishuTenantAccessToken({ tenantAccessToken: "feishu-direct" }, "connection-1"),
    ).resolves.toBe("feishu-direct");
    await expect(
      getDingTalkAccessToken({ accessToken: "dingtalk-direct" }, "connection-2"),
    ).resolves.toBe("dingtalk-direct");
    await expect(
      getDingTalkAccessToken(
        {
          appKey: "suite-key",
          appSecret: "suite-secret",
          accessToken: "dingtalk-isv-corp-token",
        },
        "connection-isv",
      ),
    ).resolves.toBe("dingtalk-isv-corp-token");
    await expect(
      getWeComAccessToken({ accessToken: "wecom-direct" }, "connection-3"),
    ).resolves.toBe("wecom-direct");
    await expect(
      getWeChatAccessToken({ accessToken: "wechat-direct" }, "connection-4"),
    ).resolves.toBe("wechat-direct");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads and caches DingTalk and WeCom application tokens", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ accessToken: "dingtalk-token", expireIn: 7200 }))
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, access_token: "wecom-token", expires_in: 7200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getDingTalkAccessToken({ appKey: "key", appSecret: "secret" }, "connection-1"),
    ).resolves.toBe("dingtalk-token");
    await expect(
      getWeComAccessToken({ corpId: "corp", corpSecret: "secret" }, "connection-2"),
    ).resolves.toBe("wecom-token");
    await getDingTalkAccessToken({ appKey: "key", appSecret: "secret" }, "connection-1");
    await getWeComAccessToken({ corpId: "corp", corpSecret: "secret" }, "connection-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads and caches a WeChat Official Account stable token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "wechat-token", expires_in: 7200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getWeChatAccessToken({ appId: "wx-app", appSecret: "secret" }, "connection-wechat"),
    ).resolves.toBe("wechat-token");
    await getWeChatAccessToken({ appId: "wx-app", appSecret: "secret" }, "connection-wechat");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.weixin.qq.com/cgi-bin/stable_token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("exchanges and caches a DingTalk suite ticket for a corp token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ accessToken: "corp-token", expireIn: 7200 }));
    vi.stubGlobal("fetch", fetchMock);
    const credentials = {
      suiteKey: "suite-key",
      suiteSecret: "suite-secret",
      suiteTicket: "suite-ticket",
      authCorpId: "corp-1",
    };

    await expect(getDingTalkIsvCorpAccessToken(credentials, "connection-isv")).resolves.toBe(
      "corp-token",
    );
    await getDingTalkIsvCorpAccessToken(credentials, "connection-isv");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dingtalk.com/v1.0/oauth2/corpAccessToken",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        suiteKey: "suite-key",
        suiteSecret: "suite-secret",
        suiteTicket: "suite-ticket",
        authCorpId: "corp-1",
      }),
    );
  });

  it("exchanges a Feishu app ticket for a cached tenant token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 0, app_access_token: "app-token", expire: 7200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { tenant_access_token: "tenant-token", expire: 7200 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const credentials = {
      appId: "cli_app",
      appSecret: "app-secret",
      appTicket: "app-ticket",
      tenantKey: "tenant-key",
    };

    await expect(getFeishuIsvTenantAccessToken(credentials, "connection-isv")).resolves.toBe(
      "tenant-token",
    );
    await getFeishuIsvTenantAccessToken(credentials, "connection-isv");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await fetchMock.mock.calls[0]?.[1]?.body).toContain('"app_ticket":"app-ticket"');
    expect(await fetchMock.mock.calls[1]?.[1]?.body).toContain('"tenant_key":"tenant-key"');
  });

  it("exchanges WeCom suite and permanent credentials for a cached corp token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, suite_access_token: "suite-token", expires_in: 7200 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, access_token: "corp-token", expires_in: 7200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const suiteAccessToken = await getWeComSuiteAccessToken(
      { suiteId: "suite-1", suiteSecret: "suite-secret", suiteTicket: "suite-ticket" },
      "connection-isv",
    );
    await expect(
      getWeComCorpAccessToken(
        { suiteAccessToken, authCorpId: "corp-1", permanentCode: "permanent-code" },
        "connection-isv",
      ),
    ).resolves.toBe("corp-token");
    await getWeComSuiteAccessToken(
      { suiteId: "suite-1", suiteSecret: "suite-secret", suiteTicket: "suite-ticket" },
      "connection-isv",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
