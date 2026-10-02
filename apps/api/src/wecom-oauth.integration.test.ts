import { createCipheriv, createHash, randomBytes } from "node:crypto";
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

describe("WeCom suite installation", () => {
  it("installs, routes messages, and reconciles provider uninstall", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-wecom-oauth-"));
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
      .values({ slug: "wecom-oauth", name: "WeCom OAuth" })
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
        email: "owner@wecom.test",
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
    const aesKey = randomBytes(32);
    const encodingAesKey = aesKey.toString("base64").replace(/=$/, "");
    const env = parseApiEnv({
      NODE_ENV: "production",
      DATABASE_URL: `file:${path.join(directory, "oauth.db")}`,
      WECOM_SUITE_ID: "suite-1",
      WECOM_SUITE_SECRET: "suite-secret",
      WECOM_SUITE_TOKEN: "suite-token",
      WECOM_SUITE_ENCODING_AES_KEY: encodingAesKey,
      WECOM_SUITE_OAUTH_REDIRECT_URI:
        "http://localhost:8090/api/v1/dashboard/channel-connections/wecom/oauth/callback",
    });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const ticket = await suiteCallback(app, aesKey, {
      InfoType: "suite_ticket",
      SuiteId: "suite-1",
      SuiteTicket: "secret-suite-ticket",
      TimeStamp: "1700000000",
    });
    expect(ticket.status).toBe(200);
    const [ticketState] = await store.db.select().from(channelProviderAppStates);
    expect(JSON.stringify(ticketState?.encryptedPayload)).not.toContain("secret-suite-ticket");

    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@wecom.test",
        password: "password12345",
        orgSlug: org.slug,
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, suite_access_token: "suite-access", expires_in: 7200 }),
      )
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, pre_auth_code: "pre-auth", expires_in: 1200 }),
      )
      .mockResolvedValueOnce(Response.json({ errcode: 0, errmsg: "ok" }))
      .mockResolvedValueOnce(
        Response.json({
          errcode: 0,
          permanent_code: "permanent-secret",
          auth_corp_info: { corpid: "corp-1", corp_name: "Customer Corp" },
          auth_info: { agent: [{ agentid: 1001 }] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, suite_access_token: "runtime-suite-token", expires_in: 7200 }),
      )
      .mockResolvedValueOnce(
        Response.json({ errcode: 0, access_token: "runtime-corp-token", expires_in: 7200 }),
      );
    vi.stubGlobal("fetch", providerFetch);
    const start = await app.request("/api/v1/dashboard/channel-connections/wecom/oauth/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id }),
    });
    expect(start.status).toBe(200);
    const authorizeUrl = new URL(((await start.json()) as { authorizeUrl: string }).authorizeUrl);
    expect(authorizeUrl.hostname).toBe("open.work.weixin.qq.com");
    expect(authorizeUrl.searchParams.get("suite_id")).toBe("suite-1");
    const state = authorizeUrl.searchParams.get("state");
    const callbackPath = `/api/v1/dashboard/channel-connections/wecom/oauth/callback?state=${state}&auth_code=auth-code`;
    const callback = await app.request(callbackPath);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("wecom=connected");
    expect((await app.request(callbackPath)).status).toBe(400);
    expect(providerFetch).toHaveBeenCalledTimes(4);

    const [connection] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "corp-1"));
    if (!connection) throw new Error("wecom_connection_missing");
    expect(connection).toMatchObject({
      channelType: "wecom",
      name: "Customer Corp",
      status: "active",
      transport: "webhook",
    });
    const sealed = JSON.stringify(connection.credentials);
    expect(sealed).not.toContain("permanent-secret");
    expect(sealed).not.toContain("suite-secret");
    expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toMatchObject({
      appType: "isv",
      suiteId: "suite-1",
      corpId: "corp-1",
      permanentCode: "permanent-secret",
      agentId: "1001",
    });

    const message = await suiteCallback(app, aesKey, {
      ToUserName: "corp-1",
      FromUserName: "user-1",
      CreateTime: "1700000001",
      MsgType: "text",
      Content: "Hello",
      MsgId: "message-1",
      AgentID: "1001",
    });
    expect(message.status).toBe(202);
    await eventually(async () => {
      const [event] = await store.db.select().from(channelIngressEvents);
      expect(event?.status).toBe("completed");
    });

    const uninstall = await suiteCallback(app, aesKey, {
      InfoType: "cancel_auth",
      SuiteId: "suite-1",
      AuthCorpId: "corp-1",
      TimeStamp: "1700000002",
    });
    expect(uninstall.status).toBe(200);
    const [disabled] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, connection.id));
    expect(disabled?.status).toBe("disabled");
    const audits = await store.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, connection.id));
    expect(audits.map((audit) => audit.action)).toContain("channel.connection.oauth_installed");
    expect(audits.map((audit) => audit.action)).toContain(
      "channel.connection.provider_uninstalled",
    );
  });
});

async function suiteCallback(
  app: ReturnType<typeof createApp>,
  aesKey: Buffer,
  fields: Record<string, string>,
) {
  const innerXml = `<xml>${Object.entries(fields)
    .map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`)
    .join("")}</xml>`;
  const encrypted = encryptWeCom(innerXml, aesKey, "suite-1");
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = "nonce";
  const signature = createHash("sha1")
    .update(["suite-token", timestamp, nonce, encrypted].sort().join(""))
    .digest("hex");
  return app.request(
    `/api/v1/webhooks/im/wecom/suite?msg_signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`,
    },
  );
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

function encryptWeCom(xml: string, aesKey: Buffer, receiveId: string): string {
  const random = randomBytes(16);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(Buffer.byteLength(xml));
  const raw = Buffer.concat([random, length, Buffer.from(xml), Buffer.from(receiveId)]);
  const padding = 32 - (raw.byteLength % 32);
  const cipher = createCipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
    cipher.final(),
  ]).toString("base64");
}
