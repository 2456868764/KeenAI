import { createCipheriv, createHash } from "node:crypto";
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
  channelProviderAppStates,
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { resetProviderTokenCacheForTests } from "./lib/channel-provider-tokens.js";
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
const stores: Array<ReturnType<typeof createLibsqlStore>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetProviderTokenCacheForTests();
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Feishu marketplace installation", () => {
  it("stores app tickets encrypted, installs a tenant once, and routes central messages", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-feishu-oauth-"));
    tempDirs.push(directory);
    const store = createLibsqlStore({ url: `file:${path.join(directory, "oauth.db")}` });
    stores.push(store);
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "feishu-oauth", name: "Feishu OAuth" })
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
        email: "owner@feishu.test",
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
      FEISHU_ISV_APP_ID: "cli_app",
      FEISHU_ISV_APP_SECRET: "app-secret",
      FEISHU_ISV_VERIFICATION_TOKEN: "verify-token",
      FEISHU_ISV_ENCRYPT_KEY: "encrypt-key",
      FEISHU_ISV_OAUTH_REDIRECT_URI:
        "http://localhost:8090/api/v1/dashboard/channel-connections/feishu/oauth/callback",
    });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const ticketResponse = await signedFeishuRequest(app, {
      event: {
        type: "app_ticket",
        app_id: "cli_app",
        app_ticket: "secret-app-ticket",
        token: "verify-token",
        uuid: "ticket-event-1",
      },
    });
    expect(ticketResponse.status).toBe(200);
    const [ticketState] = await store.db.select().from(channelProviderAppStates);
    expect(ticketState).toBeTruthy();
    expect(JSON.stringify(ticketState?.encryptedPayload)).not.toContain("secret-app-ticket");

    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@feishu.test",
        password: "password12345",
        orgSlug: org.slug,
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const start = await app.request("/api/v1/dashboard/channel-connections/feishu/oauth/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id }),
    });
    expect(start.status).toBe(200);
    const authorizeUrl = new URL(((await start.json()) as { authorizeUrl: string }).authorizeUrl);
    expect(authorizeUrl.hostname).toBe("open.feishu.cn");
    expect(authorizeUrl.searchParams.get("app_id")).toBe("cli_app");
    const state = authorizeUrl.searchParams.get("state");
    expect(state?.length).toBeGreaterThan(32);

    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: 0, data: { access_token: "user-token" } }))
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: { tenant_key: "tenant-123", open_id: "installer", name: "Installer" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { app_access_token: "app-token", expire: 7200 } }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { tenant_access_token: "tenant-token", expire: 7200 } }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 0, bot: { open_id: "bot-open-id", app_name: "KeenAI Bot" } }),
      )
      .mockResolvedValueOnce(
        Response.json({ code: 0, data: { app_access_token: "runtime-app-token", expire: 7200 } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: { tenant_access_token: "runtime-tenant-token", expire: 7200 },
        }),
      );
    vi.stubGlobal("fetch", providerFetch);
    const callbackPath = `/api/v1/dashboard/channel-connections/feishu/oauth/callback?state=${state}&code=single-use-code`;
    const callback = await app.request(callbackPath);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("feishu=connected");
    expect((await app.request(callbackPath)).status).toBe(400);
    expect(providerFetch).toHaveBeenCalledTimes(5);

    const [connection] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "tenant-123"));
    if (!connection) throw new Error("feishu_connection_missing");
    expect(connection).toMatchObject({
      orgId: org.id,
      brandId: brand.id,
      channelType: "feishu",
      name: "KeenAI Bot",
      status: "active",
      transport: "webhook",
    });
    const persisted = JSON.stringify(connection.credentials);
    expect(persisted).not.toContain("app-secret");
    expect(persisted).not.toContain("secret-app-ticket");
    expect(persisted).not.toContain("tenant-token");
    expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toEqual({
      appType: "isv",
      appId: "cli_app",
      tenantKey: "tenant-123",
    });

    const messageResponse = await signedFeishuRequest(app, {
      schema: "2.0",
      header: {
        event_id: "message-event-1",
        event_type: "im.message.receive_v1",
        app_id: "cli_app",
        tenant_key: "tenant-123",
        token: "verify-token",
      },
      event: {
        sender: { sender_id: { open_id: "user-open-id" } },
        message: {
          message_id: "message-1",
          chat_id: "chat-1",
          message_type: "text",
          content: JSON.stringify({ text: "Hello" }),
        },
      },
    });
    expect(messageResponse.status).toBe(202);
    await eventually(async () => {
      const [event] = await store.db.select().from(channelIngressEvents);
      expect(event?.status).toBe("completed");
    });
    const audits = await store.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, connection.id));
    expect(audits.some((audit) => audit.action === "channel.connection.oauth_installed")).toBe(
      true,
    );
  });
});

async function signedFeishuRequest(
  app: ReturnType<typeof createApp>,
  payload: Record<string, unknown>,
) {
  const encryptKey = "encrypt-key";
  const wrapper = { encrypt: encrypt(JSON.stringify(payload), encryptKey) };
  const rawBody = JSON.stringify(wrapper);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = "nonce-value";
  const signature = createHash("sha256")
    .update(`${timestamp}${nonce}${encryptKey}${rawBody}`)
    .digest("hex");
  return app.request("/api/v1/webhooks/im/feishu", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-lark-request-timestamp": timestamp,
      "x-lark-request-nonce": nonce,
      "x-lark-signature": signature,
    },
    body: rawBody,
  });
}

async function eventually(assertion: () => Promise<void>, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

function encrypt(value: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const iv = Buffer.alloc(16, 9);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final()]).toString("base64");
}
