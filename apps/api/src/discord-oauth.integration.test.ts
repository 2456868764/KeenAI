import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  auditLogs,
  brands,
  channelConnections,
  channelIngressEvents,
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { openChannelCredentials } from "./lib/channel-secrets.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Discord OAuth installation", () => {
  it("installs a verified guild, consumes state once, encrypts credentials and records an audit", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-discord-oauth-"));
    tempDirs.push(directory);
    const store = createLibsqlStore({ url: `file:${path.join(directory, "oauth.db")}` });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "discord-oauth", name: "Discord OAuth" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await store.db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await store.db
      .insert(accounts)
      .values({
        email: "owner@discord.test",
        name: "Owner",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await store.db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });
    const signingKeys = generateKeyPairSync("ed25519");
    const publicKey = signingKeys.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("hex");
    const env = parseApiEnv({
      NODE_ENV: "production",
      DATABASE_URL: `file:${path.join(directory, "oauth.db")}`,
      DISCORD_CLIENT_ID: "discord-client",
      DISCORD_CLIENT_SECRET: "discord-secret",
      DISCORD_BOT_TOKEN: "discord-bot-token",
      DISCORD_PUBLIC_KEY: publicKey,
      DISCORD_BOT_PERMISSIONS: "3072",
      DISCORD_OAUTH_REDIRECT_URI:
        "http://localhost:8090/api/v1/dashboard/channel-connections/discord/oauth/callback",
    });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });
    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@discord.test",
        password: "password12345",
        orgSlug: org.slug,
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const start = await app.request("/api/v1/dashboard/channel-connections/discord/oauth/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ brandId: brand.id }),
    });
    expect(start.status).toBe(200);
    const authorizeUrl = new URL(((await start.json()) as { authorizeUrl: string }).authorizeUrl);
    expect(authorizeUrl.hostname).toBe("discord.com");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("discord-client");
    const state = authorizeUrl.searchParams.get("state");
    expect(state?.length).toBeGreaterThan(32);

    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "discord-user-access",
          refresh_token: "discord-user-refresh",
          expires_in: 604800,
          scope: "bot applications.commands identify",
          permissions: "3072",
          guild: { id: "guild-123", name: "Untrusted Hint" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: "guild-123", name: "Verified Guild" }));
    vi.stubGlobal("fetch", providerFetch);
    const callbackPath = `/api/v1/dashboard/channel-connections/discord/oauth/callback?state=${state}&code=single-use-code`;
    const callback = await app.request(callbackPath);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("discord=connected");
    expect((await app.request(callbackPath)).status).toBe(400);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(providerFetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bot discord-bot-token",
    });

    const [connection] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "guild-123"));
    if (!connection) throw new Error("discord_connection_missing");
    expect(connection).toMatchObject({
      orgId: org.id,
      brandId: brand.id,
      channelType: "discord",
      name: "Verified Guild",
      status: "active",
      transport: "gateway",
    });
    expect(JSON.stringify(connection.credentials)).not.toContain("discord-bot-token");
    expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toMatchObject({
      botToken: "discord-bot-token",
      publicKey,
      oauthAccessToken: "discord-user-access",
      oauthRefreshToken: "discord-user-refresh",
    });
    expect(connection.settings).toMatchObject({ guildId: "guild-123", permissions: "3072" });

    const audits = await store.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, connection.id));
    expect(audits.some((audit) => audit.action === "channel.connection.oauth_installed")).toBe(
      true,
    );

    const pingBody = JSON.stringify({ type: 1, id: "ping-1", token: "interaction-token" });
    const pingTimestamp = String(Math.floor(Date.now() / 1_000));
    const pingSignature = signPayload(
      null,
      Buffer.from(`${pingTimestamp}${pingBody}`),
      signingKeys.privateKey,
    ).toString("hex");
    const ping = await app.request("/api/v1/webhooks/im/discord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-Timestamp": pingTimestamp,
        "X-Signature-Ed25519": pingSignature,
      },
      body: pingBody,
    });
    expect(ping.status).toBe(200);
    await expect(ping.json()).resolves.toEqual({ type: 1 });

    const interactionBody = JSON.stringify({
      type: 3,
      id: "interaction-1",
      token: "interaction-token",
      guild_id: "guild-123",
      channel_id: "channel-123",
      member: { user: { id: "user-123" } },
      data: { custom_id: "support" },
      message: { id: "message-123" },
    });
    const interactionTimestamp = String(Math.floor(Date.now() / 1_000));
    const interactionSignature = signPayload(
      null,
      Buffer.from(`${interactionTimestamp}${interactionBody}`),
      signingKeys.privateKey,
    ).toString("hex");
    const interaction = await app.request("/api/v1/webhooks/im/discord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-Timestamp": interactionTimestamp,
        "X-Signature-Ed25519": interactionSignature,
      },
      body: interactionBody,
    });
    expect(interaction.status).toBe(200);
    await expect(interaction.json()).resolves.toEqual({ type: 6 });
    const ingress = await store.db.select().from(channelIngressEvents);
    expect(ingress).toHaveLength(1);
    expect(ingress[0]).toMatchObject({
      orgId: org.id,
      brandId: brand.id,
      connectionId: connection.id,
      channelType: "discord",
      providerEventId: "interaction-1",
    });
    await eventually(async () => {
      const [settled] = await store.db.select().from(channelIngressEvents);
      expect(settled?.status).toBe("dead_letter");
    });

    await store.close();
  });
});

async function eventually(assertion: () => Promise<void>, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (candidate) {
      error = candidate;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw error;
}
