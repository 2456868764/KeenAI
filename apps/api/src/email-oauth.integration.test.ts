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
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { openChannelCredentials } from "./lib/channel-secrets.js";
import { createLogger } from "./logger.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("email OAuth installation", () => {
  it.each(["google", "microsoft"] as const)(
    "installs %s with one-time state and an encrypted mailbox credential",
    async (provider) => {
      const directory = await mkdtemp(path.join(tmpdir(), "keenai-email-install-"));
      directories.push(directory);
      const databaseUrl = `file:${path.join(directory, "oauth.db")}`;
      const store = createLibsqlStore({ url: databaseUrl });
      await migrate(store.db, {
        migrationsFolder: path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../packages/storage/migrations/libsql",
        ),
      });
      const [org] = await store.db
        .insert(organizations)
        .values({ slug: `email-oauth-${provider}`, name: "Email OAuth Org" })
        .returning();
      if (!org) throw new Error("missing_org");
      const [brand] = await store.db
        .insert(brands)
        .values({ orgId: org.id, slug: "default", name: "Default" })
        .returning();
      if (!brand) throw new Error("missing_brand");
      const [account] = await store.db
        .insert(accounts)
        .values({
          email: "owner@channel.test",
          name: "Owner",
          passwordHash: await hashPassword("password12345"),
        })
        .returning();
      if (!account) throw new Error("missing_account");
      await store.db.insert(members).values({
        orgId: org.id,
        accountId: account.id,
        role: "admin",
        status: "active",
      });
      const env = parseApiEnv({
        DATABASE_URL: databaseUrl,
        EMAIL_GOOGLE_CLIENT_ID: "google-id",
        EMAIL_GOOGLE_CLIENT_SECRET: "google-secret",
        EMAIL_MICROSOFT_CLIENT_ID: "microsoft-id",
        EMAIL_MICROSOFT_CLIENT_SECRET: "microsoft-secret",
        EMAIL_OAUTH_REDIRECT_URI:
          "http://localhost:8090/api/v1/dashboard/channel-connections/email/oauth/callback",
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
          email: "owner@channel.test",
          password: "password12345",
          orgSlug: org.slug,
        }),
      });
      const { accessToken } = (await login.json()) as { accessToken: string };
      const start = await app.request("/api/v1/dashboard/channel-connections/email/oauth/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ brandId: brand.id, provider, email: "Support@Example.com" }),
      });
      expect(start.status).toBe(200);
      const authorization = new URL(
        ((await start.json()) as { authorizeUrl: string }).authorizeUrl,
      );
      expect(authorization.searchParams.get("client_id")).toBe(`${provider}-id`);
      expect(authorization.searchParams.get("login_hint")).toBe("support@example.com");
      expect(authorization.searchParams.get("scope")).toContain(
        provider === "google" ? "mail.google.com" : "IMAP.AccessAsUser.All",
      );
      const state = authorization.searchParams.get("state");
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "mail-access-token",
            refresh_token: "mail-refresh-token",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const callbackPath = `/api/v1/dashboard/channel-connections/email/oauth/callback?state=${state}&code=single-use-code`;
      const callback = await app.request(callbackPath);
      expect(callback.status).toBe(303);
      expect(callback.headers.get("location")).toContain("email=connected");
      expect((await app.request(callbackPath)).status).toBe(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [connection] = await store.db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.externalAccountId, "support@example.com"));
      if (!connection) throw new Error("missing_email_connection");
      expect(connection.transport).toBe("polling");
      expect(JSON.stringify(connection.credentials)).not.toContain("mail-access-token");
      expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toMatchObject({
        oauthProvider: provider,
        accessToken: "mail-access-token",
        refreshToken: "mail-refresh-token",
        from: "support@example.com",
        imapUser: "support@example.com",
      });

      const manual = await app.request("/api/v1/dashboard/channel-connections/email", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandId: brand.id,
          name: "Support Mailbox",
          externalAccountId: "support@example.com",
          transport: "polling",
          credentials: { pass: "smtp-password", imapPass: "imap-password" },
          settings: {},
        }),
      });
      expect(manual.status).toBe(200);
      const [updated] = await store.db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, connection.id));
      if (!updated) throw new Error("missing_updated_connection");
      const manualCredentials = openChannelCredentials(updated.credentials, authConfig.jwtSecret);
      expect(manualCredentials.pass).toBe("smtp-password");
      expect(manualCredentials.imapPass).toBe("imap-password");
      expect(manualCredentials).not.toHaveProperty("accessToken");
      expect(manualCredentials).not.toHaveProperty("refreshToken");
      expect(manualCredentials).not.toHaveProperty("oauthProvider");
    },
  );
});
