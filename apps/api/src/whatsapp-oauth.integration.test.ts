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
  members,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { openChannelCredentials, sealChannelCredentials } from "./lib/channel-secrets.js";
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

describe("WhatsApp Embedded Signup", () => {
  it("installs only a verified phone, consumes state once, and routes signed events by phone", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-whatsapp-signup-"));
    tempDirs.push(directory);
    const store = createLibsqlStore({ url: `file:${path.join(directory, "signup.db")}` });
    await migrate(store.db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });
    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "whatsapp-signup", name: "WhatsApp Signup" })
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
        email: "owner@whatsapp.test",
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
      DATABASE_URL: `file:${path.join(directory, "signup.db")}`,
      META_APP_ID: "12345",
      META_APP_SECRET: "app-secret",
      META_EMBEDDED_SIGNUP_CONFIG_ID: "config-123",
      WHATSAPP_VERIFY_TOKEN: "verify-me",
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
        email: "owner@whatsapp.test",
        password: "password12345",
        orgSlug: org.slug,
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const start = async () => {
      const response = await app.request(
        "/api/v1/dashboard/channel-connections/whatsapp/signup/start",
        { method: "POST", headers, body: JSON.stringify({ brandId: brand.id }) },
      );
      expect(response.status).toBe(200);
      return (await response.json()) as { state: string; appId: string; configId: string };
    };
    const complete = (state: string, phoneNumberId: string) =>
      app.request("/api/v1/dashboard/channel-connections/whatsapp/signup/complete", {
        method: "POST",
        headers,
        body: JSON.stringify({ state, code: "single-use-code", wabaId: "900", phoneNumberId }),
      });
    const providerFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const json = url.pathname.endsWith("/oauth/access_token")
        ? { access_token: "meta-business-token" }
        : url.pathname.endsWith("/debug_token")
          ? { data: { is_valid: true, app_id: "12345" } }
          : url.pathname.endsWith("/phone_numbers")
            ? { data: [{ id: "1001", display_phone_number: "+1 555 0001" }, { id: "1002" }] }
            : { success: true };
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", providerFetch);

    const firstState = await start();
    expect(firstState).toMatchObject({ appId: "12345", configId: "config-123" });
    expect((await complete(firstState.state, "9999")).status).toBe(422);
    expect(await store.db.select().from(channelConnections)).toHaveLength(0);
    expect((await complete(firstState.state, "1001")).status).toBe(400);

    const state = await start();
    const installed = await complete(state.state, "1001");
    expect(installed.status).toBe(200);
    expect((await complete(state.state, "1001")).status).toBe(400);
    const second = await start();
    expect((await complete(second.state, "1002")).status).toBe(200);
    const [connection] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "1001"));
    if (!connection) throw new Error("whatsapp_connection_missing");
    expect(JSON.stringify(connection.credentials)).not.toContain("meta-business-token");
    expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toMatchObject({
      phoneNumberId: "1001",
      wabaId: "900",
      accessToken: "meta-business-token",
      appSecret: "app-secret",
    });

    const verification = await app.request(
      "/api/v1/webhooks/im/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=ok&org=whatsapp-signup",
    );
    expect(verification.status).toBe(200);
    expect(await verification.text()).toBe("ok");
    const centralVerification = await app.request(
      "/api/v1/webhooks/im/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=central-ok",
    );
    expect(centralVerification.status).toBe(200);
    expect(await centralVerification.text()).toBe("central-ok");

    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "900",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1002" },
                messages: [
                  { id: "wamid.1002", from: "15551112222", type: "text", text: { body: "Hello" } },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    const webhook = (url: string, signed = true) =>
      app.request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signed ? signature : "sha256=invalid",
        },
        body,
      });
    expect((await webhook("/api/v1/webhooks/im/whatsapp?org=whatsapp-signup", false)).status).toBe(
      403,
    );
    expect(
      (
        await webhook(
          `/api/v1/webhooks/im/whatsapp?org=whatsapp-signup&connection=${connection.id}`,
        )
      ).status,
    ).toBe(403);
    expect((await webhook("/api/v1/webhooks/im/whatsapp?org=whatsapp-signup")).status).toBe(202);
    await eventually(async () => {
      const events = await store.db.select().from(channelIngressEvents);
      expect(events).toHaveLength(1);
      expect(events[0]?.status).toBe("completed");
    });

    const batch = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "900",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1002" },
                messages: [
                  { id: "wamid.1003", from: "15551112222", type: "text", text: { body: "One" } },
                  { id: "wamid.1004", from: "15551112222", type: "text", text: { body: "Two" } },
                ],
              },
            },
          ],
        },
      ],
    });
    const batchResponse = await app.request("/api/v1/webhooks/im/whatsapp?org=whatsapp-signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", "app-secret").update(batch).digest("hex")}`,
      },
      body: batch,
    });
    expect(batchResponse.status).toBe(202);
    await expect(batchResponse.json()).resolves.toMatchObject({ messages: 2 });
    await eventually(async () => {
      const events = await store.db.select().from(channelIngressEvents);
      expect(events).toHaveLength(3);
      expect(events.every((event) => event.status === "completed")).toBe(true);
    });

    const [secondOrgRow] = await store.db
      .insert(organizations)
      .values({ slug: "whatsapp-central-second", name: "Second Org" })
      .returning();
    const secondOrg = requireRow(secondOrgRow, "second org");
    const [secondBrandRow] = await store.db
      .insert(brands)
      .values({ orgId: secondOrg.id, slug: "default", name: "Default" })
      .returning();
    const secondBrand = requireRow(secondBrandRow, "second brand");
    const [secondConnectionRow] = await store.db
      .insert(channelConnections)
      .values({
        orgId: secondOrg.id,
        brandId: secondBrand.id,
        channelType: "whatsapp",
        externalAccountId: "2001",
        name: "Second WhatsApp number",
        status: "active",
        transport: "webhook",
        credentials: sealChannelCredentials(
          { phoneNumberId: "2001", appSecret: "app-secret", accessToken: "second-token" },
          authConfig.jwtSecret,
        ),
        settings: {},
      })
      .returning();
    const secondConnection = requireRow(secondConnectionRow, "second connection");
    const centralBatch = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "900",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1002" },
                messages: [
                  {
                    id: "wamid.central.first",
                    from: "15551112222",
                    type: "text",
                    text: { body: "First tenant" },
                  },
                ],
              },
            },
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "2001" },
                messages: [
                  {
                    id: "wamid.central.second",
                    from: "15553334444",
                    type: "text",
                    text: { body: "Second tenant" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const centralResponse = await app.request("/api/v1/webhooks/im/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", "app-secret").update(centralBatch).digest("hex")}`,
      },
      body: centralBatch,
    });
    expect(centralResponse.status).toBe(202);
    await expect(centralResponse.json()).resolves.toMatchObject({ messages: 2 });
    await eventually(async () => {
      const events = await store.db.select().from(channelIngressEvents);
      expect(events).toHaveLength(5);
      expect(events.some((event) => event.connectionId === secondConnection.id)).toBe(true);
      expect(events.every((event) => event.status === "completed")).toBe(true);
    });

    const [manual] = await store.db
      .insert(channelConnections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        channelType: "whatsapp",
        externalAccountId: "default",
        name: "Manually configured number",
        status: "active",
        transport: "webhook",
        credentials: sealChannelCredentials(
          { phoneNumberId: "1003", appSecret: "app-secret", accessToken: "manual-token" },
          authConfig.jwtSecret,
        ),
        settings: {},
      })
      .returning();
    const manualPayload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "901",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1003" },
                messages: [
                  {
                    id: "wamid.manual",
                    from: "15551112222",
                    type: "text",
                    text: { body: "Manual" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const manualResponse = await app.request("/api/v1/webhooks/im/whatsapp?org=whatsapp-signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", "app-secret").update(manualPayload).digest("hex")}`,
      },
      body: manualPayload,
    });
    expect(manualResponse.status).toBe(202);
    await eventually(async () => {
      const events = await store.db.select().from(channelIngressEvents);
      expect(events).toHaveLength(6);
      expect(events[5]?.connectionId).toBe(manual?.id);
      expect(events[5]?.status).toBe("completed");
    });

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
