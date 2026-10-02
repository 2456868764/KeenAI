import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISCORD_BOT_PERMISSIONS,
  discordOAuthAuthorizeUrl,
  exchangeDiscordAuthorizationCode,
} from "./discord-oauth.js";

const env = {
  DISCORD_CLIENT_ID: "app-1",
  DISCORD_CLIENT_SECRET: "client-secret",
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_PUBLIC_KEY: "public-key",
  DISCORD_OAUTH_REDIRECT_URI:
    "http://localhost:8090/api/v1/dashboard/channel-connections/discord/oauth/callback",
  DISCORD_BOT_PERMISSIONS: "3072",
};

afterEach(() => vi.unstubAllGlobals());

describe("Discord OAuth", () => {
  it("builds an advanced guild installation authorization URL", () => {
    const url = new URL(discordOAuthAuthorizeUrl(env, "state-1"));
    expect(url.origin).toBe("https://discord.com");
    expect(url.searchParams.get("scope")).toBe("bot applications.commands identify");
    expect(url.searchParams.get("integration_type")).toBe("0");
    expect(url.searchParams.get("permissions")).toBe("3072");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("requests every permission required by the declared channel capabilities by default", () => {
    const url = new URL(
      discordOAuthAuthorizeUrl({ ...env, DISCORD_BOT_PERMISSIONS: undefined }, "state-2"),
    );
    expect(url.searchParams.get("permissions")).toBe(DEFAULT_DISCORD_BOT_PERMISSIONS);
  });

  it("exchanges the code and verifies the installed guild with the bot token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "user-access",
          refresh_token: "user-refresh",
          expires_in: 604800,
          scope: "bot applications.commands identify",
          guild: { id: "guild-1", name: "Hint" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: "guild-1", name: "Verified Guild" }));
    vi.stubGlobal("fetch", fetchMock);

    const installation = await exchangeDiscordAuthorizationCode(env, "code-1");

    expect(installation).toMatchObject({
      accountId: "guild-1",
      name: "Verified Guild",
      credentials: { botToken: "bot-token", publicKey: "public-key" },
      settings: { guildId: "guild-1" },
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bot bot-token",
    });
  });
});
