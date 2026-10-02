import type { ApiEnv } from "@keenai/shared";
import type { ChannelConnectionRow } from "@keenai/storage/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disconnectChannelProvider } from "./channel-disconnect.js";

const base = {
  id: "connection-1",
  orgId: "org-1",
  brandId: "brand-1",
  name: "Connection",
  status: "active",
  transport: "webhook",
  credentials: {},
  settings: {},
  lastError: null,
  lastConnectedAt: null,
  runtimeState: "stopped",
  runtimeOwnerId: null,
  runtimeLeaseToken: null,
  runtimeLeaseExpiresAt: null,
  runtimeHeartbeatAt: null,
  runtimeNextAttemptAt: null,
  runtimeCursor: {},
  reconnectAttempts: 0,
  credentialRefreshLeaseToken: null,
  credentialRefreshLeaseExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<ChannelConnectionRow, "channelType" | "externalAccountId">;

afterEach(() => vi.unstubAllGlobals());

describe("channel provider disconnect", () => {
  it("uninstalls Slack remotely", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "slack", externalAccountId: "T1" },
        { botToken: "xoxb-token" },
        { SLACK_CLIENT_ID: "client", SLACK_CLIENT_SECRET: "secret" } as ApiEnv,
      ),
    ).resolves.toEqual({ mode: "remote", providerAction: "apps.uninstall" });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer xoxb-token",
    });
  });

  it("makes the Discord bot leave its installed guild", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "discord", externalAccountId: "guild-1" },
        { botToken: "bot-token" },
        {} as ApiEnv,
      ),
    ).resolves.toEqual({ mode: "remote", providerAction: "guild.leave" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/guilds/guild-1");
  });

  it("revokes Google email OAuth and locally deletes Microsoft tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "email", externalAccountId: "owner@example.com" },
        { oauthProvider: "google", refreshToken: "refresh-token" },
        {} as ApiEnv,
      ),
    ).resolves.toEqual({ mode: "remote", providerAction: "oauth.revoke" });
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "email", externalAccountId: "owner@example.com" },
        { oauthProvider: "microsoft", refreshToken: "refresh-token" },
        {} as ApiEnv,
      ),
    ).resolves.toEqual({ mode: "local_only", providerAction: "oauth.local_token_delete" });
  });

  it("deregisters a WhatsApp phone number remotely", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "whatsapp", externalAccountId: "phone-1" },
        { accessToken: "meta-token", phoneNumberId: "phone-1", graphApiVersion: "v20.0" },
        { WHATSAPP_GRAPH_API_VERSION: "v20.0" } as ApiEnv,
      ),
    ).resolves.toEqual({ mode: "remote", providerAction: "phone_number.deregister" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v20.0/phone-1/deregister");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer meta-token",
    });
  });

  it("removes a Telegram webhook before disabling the connection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true, result: true }))
      .mockResolvedValueOnce(
        Response.json({ ok: true, result: { url: "", pending_update_count: 0 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "telegram", externalAccountId: "bot-1" },
        { botToken: "bot-token" },
        {} as ApiEnv,
      ),
    ).resolves.toEqual({ mode: "remote", providerAction: "deleteWebhook" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/deleteWebhook");
  });

  it("requires administrator uninstall for a DingTalk marketplace app", async () => {
    await expect(
      disconnectChannelProvider(
        { ...base, channelType: "dingtalk", externalAccountId: "corp-1" },
        { appType: "isv", suiteKey: "suite-key", corpId: "corp-1" },
        {} as ApiEnv,
      ),
    ).resolves.toEqual({
      mode: "local_only",
      providerAction: "provider_admin_uninstall_required",
    });
  });
});
