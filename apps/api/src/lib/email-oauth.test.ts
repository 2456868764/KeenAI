import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, channelConnections, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";
import { loadEmailCredentials } from "./email-oauth.js";

const secret = "test-secret-at-least-32-characters-long!!";
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("email OAuth credential refresh", () => {
  it.each(["google", "microsoft"] as const)(
    "refreshes %s once across concurrent callers and persists rotated credentials",
    async (provider) => {
      const directory = await mkdtemp(path.join(tmpdir(), "keenai-email-oauth-"));
      directories.push(directory);
      const store = createLibsqlStore({ url: `file:${path.join(directory, "oauth.db")}` });
      await migrate(store.db, {
        migrationsFolder: path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../packages/storage/migrations/libsql",
        ),
      });
      const [org] = await store.db
        .insert(organizations)
        .values({ slug: `email-${provider}`, name: "Email Test" })
        .returning();
      if (!org) throw new Error("missing_org");
      const [brand] = await store.db
        .insert(brands)
        .values({ orgId: org.id, slug: "default", name: "Default" })
        .returning();
      if (!brand) throw new Error("missing_brand");
      const [connection] = await store.db
        .insert(channelConnections)
        .values({
          orgId: org.id,
          brandId: brand.id,
          channelType: "email",
          name: "Support",
          externalAccountId: "support@example.com",
          transport: "polling",
          credentials: sealChannelCredentials(
            {
              oauthProvider: provider,
              accessToken: "expired-token",
              refreshToken: "original-refresh",
              expiresAt: Date.now() - 1_000,
              host: "smtp.example.com",
            },
            secret,
          ),
        })
        .returning();
      if (!connection) throw new Error("missing_connection");
      const env = parseApiEnv({
        DATABASE_URL: `file:${path.join(directory, "oauth.db")}`,
        EMAIL_GOOGLE_CLIENT_ID: "google-id",
        EMAIL_GOOGLE_CLIENT_SECRET: "google-secret",
        EMAIL_MICROSOFT_CLIENT_ID: "microsoft-id",
        EMAIL_MICROSOFT_CLIENT_SECRET: "microsoft-secret",
      });
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const form = init.body as URLSearchParams;
        expect(form.get("refresh_token")).toBe("original-refresh");
        expect(form.get("client_id")).toBe(`${provider}-id`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({
            access_token: "new-token",
            expires_in: 3600,
            ...(provider === "microsoft" ? { refresh_token: "rotated-refresh" } : {}),
          }),
          { status: 200 },
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const [first, second] = await Promise.all([
        loadEmailCredentials(store, connection, secret, env),
        loadEmailCredentials(store, connection, secret, env),
      ]);
      expect(first.accessToken).toBe("new-token");
      expect(second.accessToken).toBe("new-token");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [saved] = await store.db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, connection.id));
      if (!saved) throw new Error("missing_saved_connection");
      const decrypted = openChannelCredentials(saved.credentials, secret);
      expect(decrypted.refreshToken).toBe(
        provider === "microsoft" ? "rotated-refresh" : "original-refresh",
      );
      expect(decrypted.host).toBe("smtp.example.com");
      expect(saved.credentialRefreshLeaseToken).toBeNull();
    },
  );
});
