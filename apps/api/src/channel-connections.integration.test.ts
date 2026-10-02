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
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

afterEach(() => vi.unstubAllGlobals());

describe("channel connections", () => {
  it("stores credentials encrypted and never returns credential values", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "channel-org", name: "Channel Org" })
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
        email: "owner@channel.test",
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
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
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
        orgSlug: "channel-org",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const saved = await app.request("/api/v1/dashboard/channel-connections/telegram", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        brandId: brand.id,
        name: "Telegram",
        credentials: { botToken: "super-secret-token" },
        settings: { mode: "webhook" },
        transport: "polling",
      }),
    });
    expect(saved.status).toBe(200);
    const savedBody = await saved.text();
    expect(savedBody).not.toContain("super-secret-token");
    expect(savedBody).toContain("botToken");
    expect(savedBody).toContain('"status":"pending"');

    const [stored] = await store.db.select().from(channelConnections).limit(1);
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("pending");
    expect(stored?.lastConnectedAt).toBeNull();
    expect(JSON.stringify(stored?.credentials)).not.toContain("super-secret-token");

    const listed = await app.request(`/api/v1/dashboard/channel-connections?brandId=${brand.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      items: Array<{ configuredCredentialKeys: string[] }>;
    };
    expect(body.items[0]?.configuredCredentialKeys).toEqual(["botToken"]);

    const createdAudits = await store.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "channel.connection.created"));
    expect(createdAudits).toHaveLength(1);
    expect(JSON.stringify(createdAudits[0]?.changes)).not.toContain("super-secret-token");

    const providerFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/getMe")) {
        return Response.json({ ok: true, result: { id: 123, username: "keenai_bot" } });
      }
      if (url.endsWith("/deleteWebhook")) return Response.json({ ok: true, result: true });
      if (url.endsWith("/getWebhookInfo")) {
        return Response.json({ ok: true, result: { url: "", pending_update_count: 0 } });
      }
      throw new Error(`unexpected Telegram request: ${url}`);
    });
    vi.stubGlobal("fetch", providerFetch);
    const telegramTested = await app.request(
      `/api/v1/dashboard/channel-connections/${stored?.id ?? ""}/test`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(telegramTested.status).toBe(200);
    await expect(telegramTested.json()).resolves.toMatchObject({
      result: {
        ok: true,
        providerAccountId: "123",
        lifecycle: { providerAction: "deleteWebhook", webhookUrl: null },
      },
    });
    const [verifiedTelegram] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, stored?.id ?? ""));
    expect(verifiedTelegram?.status).toBe("active");
    expect(verifiedTelegram?.lastConnectedAt).toBeInstanceOf(Date);

    const widgetSaved = await app.request("/api/v1/dashboard/channel-connections/widget", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        brandId: brand.id,
        name: "Widget",
        credentials: {},
        settings: {},
      }),
    });
    const widgetBody = (await widgetSaved.json()) as { connection: { id: string } };
    const tested = await app.request(
      `/api/v1/dashboard/channel-connections/${widgetBody.connection.id}/test`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(tested.status).toBe(200);
    await expect(tested.json()).resolves.toMatchObject({
      result: { ok: true, verification: "local", displayName: "KeenAI Messenger" },
    });

    const changed = await app.request("/api/v1/dashboard/channel-connections/telegram", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        brandId: brand.id,
        name: "Telegram",
        credentials: { botToken: "invalid-replacement-token" },
        settings: { mode: "webhook" },
        transport: "polling",
      }),
    });
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toMatchObject({
      connection: { id: stored?.id, status: "pending", lastConnectedAt: null },
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 })),
    );
    const failedTest = await app.request(
      `/api/v1/dashboard/channel-connections/${stored?.id ?? ""}/test`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(failedTest.status).toBe(422);
    await expect(failedTest.json()).resolves.toEqual({ error: "provider_http_401" });
    const [failedTelegram] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, stored?.id ?? ""));
    expect(failedTelegram).toMatchObject({
      status: "error",
      lastConnectedAt: null,
      lastError: "provider_http_401",
    });
    vi.stubGlobal("fetch", providerFetch);

    const disabled = await app.request(
      `/api/v1/dashboard/channel-connections/${stored?.id ?? ""}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    expect(disabled.status).toBe(204);
    const [stillStored] = await store.db.select().from(channelConnections).limit(1);
    expect(stillStored?.status).toBe("disabled");
    const disabledAudits = await store.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "channel.connection.disabled"));
    expect(disabledAudits).toHaveLength(1);
    expect(providerFetch).toHaveBeenCalledWith(
      expect.stringContaining("/deleteWebhook"),
      expect.objectContaining({ method: "POST" }),
    );
    await store.close();
  });
});
