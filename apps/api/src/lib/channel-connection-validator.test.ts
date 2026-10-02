import type { ChannelConnectionConfig } from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateChannelConnection } from "./channel-connection-validator.js";

afterEach(() => vi.unstubAllGlobals());

describe("validateChannelConnection", () => {
  it("verifies Telegram bot identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ ok: true, result: { id: 123, username: "keenai_bot" } })),
    );
    await expect(
      validateChannelConnection(connection("telegram", { botToken: "token" })),
    ).resolves.toEqual({
      ok: true,
      verification: "provider",
      providerAccountId: "123",
      displayName: "keenai_bot",
    });
  });

  it("verifies Slack workspace identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ ok: true, team_id: "T1", team: "Support" })),
    );
    await expect(
      validateChannelConnection(connection("slack", { botToken: "token" })),
    ).resolves.toMatchObject({
      verification: "provider",
      providerAccountId: "T1",
      displayName: "Support",
    });
  });

  it("verifies the Slack app-level token for Socket Mode", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, team_id: "T1" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, url: "wss://wss.slack.test/link" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      validateChannelConnection({
        ...connection("slack", { botToken: "bot-token", appToken: "app-token" }),
        transport: "stream",
      }),
    ).resolves.toMatchObject({ verification: "provider", providerAccountId: "T1" });
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      "Bearer app-token",
    );
  });

  it("verifies Discord bot identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: "D1", username: "KeenAI" })),
    );
    await expect(
      validateChannelConnection(connection("discord", { botToken: "token" })),
    ).resolves.toMatchObject({
      verification: "provider",
      providerAccountId: "D1",
    });
  });

  it("rejects a Discord response without a bot identity", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({})));
    await expect(
      validateChannelConnection(connection("discord", { botToken: "token" })),
    ).rejects.toThrow("discord_bot_identity_missing");
  });

  it("verifies Feishu bot identity using an existing tenant token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ code: 0, bot: { open_id: "ou-1", bot_name: "KeenAI" } })),
    );
    await expect(
      validateChannelConnection(connection("feishu", { tenantAccessToken: "token" })),
    ).resolves.toMatchObject({ providerAccountId: "ou-1", displayName: "KeenAI" });
  });

  it("rejects a Feishu app without an enabled bot identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: 0, data: {} })),
    );
    await expect(
      validateChannelConnection(connection("feishu", { tenantAccessToken: "token" })),
    ).rejects.toThrow("feishu_bot_identity_missing");
  });

  it("verifies DingTalk application credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ accessToken: "token" })),
    );
    await expect(
      validateChannelConnection(
        connection("dingtalk", { appKey: "key", appSecret: "secret", robotCode: "robot" }),
      ),
    ).resolves.toMatchObject({ verification: "provider", providerAccountId: "robot" });
  });

  it("accepts an already hydrated DingTalk ISV corp token without another token exchange", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      validateChannelConnection(
        connection("dingtalk", {
          appType: "isv",
          corpId: "corp-1",
          accessToken: "short-lived-corp-token",
        }),
      ),
    ).resolves.toMatchObject({ verification: "provider", providerAccountId: "corp-1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies WhatsApp phone number identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ id: "phone-1", verified_name: "KeenAI Support" })),
    );
    await expect(
      validateChannelConnection(
        connection("whatsapp", { accessToken: "token", phoneNumberId: "phone-1" }),
      ),
    ).resolves.toMatchObject({ providerAccountId: "phone-1", displayName: "KeenAI Support" });
  });

  it("rejects a WhatsApp token for a different phone number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: "phone-2" })),
    );
    await expect(
      validateChannelConnection(
        connection("whatsapp", { accessToken: "token", phoneNumberId: "phone-1" }),
      ),
    ).rejects.toThrow("whatsapp_phone_number_identity_mismatch");
  });

  it("verifies WeCom agent identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ errcode: 0, agentid: 1001, name: "KeenAI" })),
    );
    await expect(
      validateChannelConnection(
        connection("wecom", { accessToken: "token" }, { wecomAgentId: 1001 }),
      ),
    ).resolves.toMatchObject({ providerAccountId: "1001", displayName: "KeenAI" });
  });

  it("rejects a WeCom connection without a send-capable agent", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    await expect(
      validateChannelConnection(connection("wecom", { accessToken: "token" })),
    ).rejects.toThrow("wecom_agent_id_required");
  });

  it("verifies a WeChat Official Account with a stable token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "wechat-token", expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ ip_list: ["203.0.113.1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      validateChannelConnection(
        connection("wechat", {
          appId: "wx-app-1",
          appSecret: "secret",
          callbackToken: "callback-token",
        }),
      ),
    ).resolves.toMatchObject({
      verification: "provider",
      providerAccountId: "wx-app-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects provider authentication failures without leaking credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: false, error: "invalid_auth" })),
    );
    await expect(
      validateChannelConnection(connection("slack", { botToken: "secret-token" })),
    ).rejects.toThrow("slack_invalid_auth");
  });
});

function connection(
  channelType: ChannelConnectionConfig["channelType"],
  credentials: Record<string, unknown>,
  settings: Record<string, unknown> = {},
): ChannelConnectionConfig {
  return {
    connectionId: `${channelType}-1`,
    orgId: "org-1",
    brandId: "brand-1",
    channelType,
    credentials,
    settings,
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
