import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  channelConnections,
  channelIngressEvents,
  channelSessionCommands,
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { openChannelCredentials, sealChannelCredentials } from "./lib/channel-secrets.js";
import { loadChannelCredentials } from "./lib/slack-oauth.js";
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

describe("Slack OAuth installation", () => {
  it("installs, deduplicates callbacks, routes by Team ID and rotates the bot token", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-slack-oauth-"));
    tempDirs.push(directory);
    const store = createLibsqlStore({
      url: `file:${path.join(directory, "oauth.db")}`,
    });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "slack-oauth-org", name: "Slack OAuth Org" })
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
        email: "slack-owner@channel.test",
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
    const env = parseApiEnv({
      NODE_ENV: "production",
      DATABASE_URL: `file:${path.join(directory, "oauth.db")}`,
      SLACK_CLIENT_ID: "client-id",
      SLACK_CLIENT_SECRET: "client-secret",
      SLACK_SIGNING_SECRET: "signing-secret",
      SLACK_OAUTH_REDIRECT_URI:
        "http://localhost:8090/api/v1/dashboard/channel-connections/slack/oauth/callback",
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
        email: "slack-owner@channel.test",
        password: "password12345",
        orgSlug: org.slug,
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const start = await app.request("/api/v1/dashboard/channel-connections/slack/oauth/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ brandId: brand.id }),
    });
    expect(start.status).toBe(200);
    const { authorizeUrl } = (await start.json()) as { authorizeUrl: string };
    const authorization = new URL(authorizeUrl);
    expect(authorization.hostname).toBe("slack.com");
    expect(authorization.searchParams.get("client_id")).toBe("client-id");
    const scopes = authorization.searchParams.get("scope")?.split(",") ?? [];
    expect(scopes).toContain("reactions:read");
    expect(scopes).toContain("reactions:write");
    const state = authorization.searchParams.get("state");
    expect(state?.length).toBeGreaterThan(32);

    const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-first",
          refresh_token: "xoxe-first",
          expires_in: 3600,
          token_type: "bot",
          team: { id: "T123", name: "Example Team" },
          scope: "chat:write,im:history",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", providerFetch);
    const callbackPath = `/api/v1/dashboard/channel-connections/slack/oauth/callback?state=${state}&code=single-use-code`;
    const callback = await app.request(callbackPath);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("slack=connected");
    expect((await app.request(callbackPath)).status).toBe(400);
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const [connection] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "T123"));
    if (!connection) throw new Error("slack_connection_missing");
    expect(connection.name).toBe("Example Team");
    expect(JSON.stringify(connection.credentials)).not.toContain("xoxb-first");
    expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toMatchObject({
      botToken: "xoxb-first",
      refreshToken: "xoxe-first",
      signingSecret: "signing-secret",
    });
    await store.db
      .update(channelConnections)
      .set({
        transport: "stream",
        credentials: sealChannelCredentials(
          {
            ...openChannelCredentials(connection.credentials, authConfig.jwtSecret),
            appToken: "xapp-manual",
          },
          authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, connection.id));
    const reinstallStart = await app.request(
      "/api/v1/dashboard/channel-connections/slack/oauth/start",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ brandId: brand.id }),
      },
    );
    const reinstallUrl = new URL(
      ((await reinstallStart.json()) as { authorizeUrl: string }).authorizeUrl,
    );
    providerFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-reinstalled",
          token_type: "bot",
          team: { id: "T123", name: "Example Team" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const reinstalled = await app.request(
      `/api/v1/dashboard/channel-connections/slack/oauth/callback?state=${reinstallUrl.searchParams.get("state")}&code=reinstall-code`,
    );
    expect(reinstalled.status).toBe(303);
    const installedRows = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "T123"));
    expect(installedRows).toHaveLength(1);
    expect(installedRows[0]?.id).toBe(connection.id);
    expect(installedRows[0]?.transport).toBe("stream");
    const reinstalledCredentials = openChannelCredentials(
      installedRows[0]?.credentials ?? {},
      authConfig.jwtSecret,
    );
    expect(reinstalledCredentials).toMatchObject({
      botToken: "xoxb-reinstalled",
      appToken: "xapp-manual",
    });
    expect(reinstalledCredentials).not.toHaveProperty("refreshToken");

    const [otherConnection] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "slack",
        externalAccountId: "T456",
        name: "Other Team",
        credentials: sealChannelCredentials(
          { signingSecret: "other-secret" },
          authConfig.jwtSecret,
        ),
      })
      .returning({ id: channelConnections.id });
    const challengeBody = JSON.stringify({
      type: "url_verification",
      team: { id: "T123" },
      challenge: "team-routed-challenge",
    });
    const challengeTimestamp = String(Math.floor(Date.now() / 1_000));
    const challengeSignature = `v0=${createHmac("sha256", "signing-secret")
      .update(`v0:${challengeTimestamp}:${challengeBody}`)
      .digest("hex")}`;
    const challenge = await app.request("/api/v1/webhooks/im/slack?org=slack-oauth-org", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Slack-Request-Timestamp": challengeTimestamp,
        "X-Slack-Signature": challengeSignature,
      },
      body: challengeBody,
    });
    expect(challenge.status).toBe(200);
    await expect(challenge.json()).resolves.toEqual({
      challenge: "team-routed-challenge",
    });
    const mismatched = await app.request(
      `/api/v1/webhooks/im/slack?org=slack-oauth-org&connection=${otherConnection?.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Slack-Request-Timestamp": challengeTimestamp,
          "X-Slack-Signature": challengeSignature,
        },
        body: challengeBody,
      },
    );
    expect(mismatched.status).toBe(403);
    const event = JSON.stringify({
      type: "event_callback",
      event_id: "Ev123",
      team_id: "T123",
      event: {
        type: "message",
        channel: "C123",
        user: "U123",
        ts: "123.45",
        text: "Hi",
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = `v0=${createHmac("sha256", "signing-secret")
      .update(`v0:${timestamp}:${event}`)
      .digest("hex")}`;
    const inbound = await app.request("/api/v1/webhooks/im/slack?org=slack-oauth-org", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Slack-Request-Timestamp": timestamp,
        "X-Slack-Signature": signature,
      },
      body: event,
    });
    expect(inbound.status).toBe(202);
    await eventually(async () => {
      const ingress = await store.db.select().from(channelIngressEvents);
      const sessions = await store.db.select().from(channelSessionCommands);
      expect(ingress).toHaveLength(1);
      expect(ingress[0]?.status).toBe("completed");
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.status).toBe("completed");
    });

    const centralEvent = JSON.stringify({
      type: "event_callback",
      event_id: "Ev124",
      team_id: "T123",
      event: {
        type: "message",
        channel: "C123",
        user: "U123",
        ts: "123.46",
        text: "Hi",
      },
    });
    const centralTimestamp = String(Math.floor(Date.now() / 1_000));
    const centralSignature = `v0=${createHmac("sha256", "signing-secret")
      .update(`v0:${centralTimestamp}:${centralEvent}`)
      .digest("hex")}`;
    const centralInbound = await app.request("/api/v1/webhooks/im/slack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Slack-Request-Timestamp": centralTimestamp,
        "X-Slack-Signature": centralSignature,
      },
      body: centralEvent,
    });
    expect(centralInbound.status).toBe(202);
    await eventually(async () => {
      const ingress = await store.db.select().from(channelIngressEvents);
      const sessions = await store.db.select().from(channelSessionCommands);
      expect(ingress).toHaveLength(2);
      expect(sessions).toHaveLength(2);
    });

    await store.db
      .update(channelConnections)
      .set({
        credentials: sealChannelCredentials(
          {
            botToken: "xoxb-first",
            refreshToken: "xoxe-first",
            expiresAt: Date.now() - 1_000,
            signingSecret: "signing-secret",
            appToken: "xapp-manual",
          },
          authConfig.jwtSecret,
        ),
      })
      .where(eq(channelConnections.id, connection.id));
    const refreshFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-second",
          refresh_token: "xoxe-second",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", refreshFetch);
    const [refreshed, concurrent] = await Promise.all([
      loadChannelCredentials(store, connection, authConfig.jwtSecret, env),
      loadChannelCredentials(store, connection, authConfig.jwtSecret, env),
    ]);
    expect(refreshed).toMatchObject({
      botToken: "xoxb-second",
      refreshToken: "xoxe-second",
      appToken: "xapp-manual",
    });
    expect(concurrent).toMatchObject({ botToken: "xoxb-second" });
    expect(refreshFetch).toHaveBeenCalledTimes(1);
    const [stored] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, connection.id));
    expect(openChannelCredentials(stored?.credentials ?? {}, authConfig.jwtSecret)).toMatchObject({
      botToken: "xoxb-second",
      refreshToken: "xoxe-second",
    });
    const manual = await app.request("/api/v1/dashboard/channel-connections/slack", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brandId: brand.id,
        name: "Example Team",
        externalAccountId: "T123",
        credentials: { botToken: "xoxb-manual" },
        settings: {},
      }),
    });
    expect(manual.status).toBe(200);
    const [manualRow] = await store.db
      .select({ credentials: channelConnections.credentials })
      .from(channelConnections)
      .where(eq(channelConnections.id, connection.id));
    const manualCredentials = openChannelCredentials(
      manualRow?.credentials ?? {},
      authConfig.jwtSecret,
    );
    expect(manualCredentials.botToken).toBe("xoxb-manual");
    expect(manualCredentials).not.toHaveProperty("refreshToken");
    expect(manualCredentials).not.toHaveProperty("expiresAt");
    await store.close();
  });
});

async function eventually(assertion: () => Promise<void>) {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}
