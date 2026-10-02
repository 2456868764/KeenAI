import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { verifyDingTalkSignature } from "@keenai/channels-im";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  auditLogs,
  brands,
  channelConnections,
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

describe("DingTalk marketplace installation", () => {
  it("installs a corp once, stores no short-lived secrets, and reconciles suite_relieve", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "keenai-dingtalk-oauth-"));
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
      .values({ slug: "dingtalk-oauth", name: "DingTalk OAuth" })
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
        email: "owner@dingtalk.test",
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
      DINGTALK_ISV_SUITE_KEY: "suite-key",
      DINGTALK_ISV_SUITE_SECRET: "suite-secret",
      DINGTALK_ISV_CALLBACK_TOKEN: "callback-token",
      DINGTALK_ISV_ENCODING_AES_KEY: encodingAesKey,
      DINGTALK_ISV_OAUTH_REDIRECT_URI:
        "http://localhost:8090/api/v1/dashboard/channel-connections/dingtalk/oauth/callback",
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
      EventType: "suite_ticket",
      SuiteKey: "suite-key",
      SuiteTicket: "secret-suite-ticket",
      TimeStamp: "1700000000",
    });
    expect(ticket.response.status).toBe(200);
    expect(ticket.message).toBe("success");
    const [ticketState] = await store.db.select().from(channelProviderAppStates);
    expect(JSON.stringify(ticketState?.encryptedPayload)).not.toContain("secret-suite-ticket");

    const login = await app.request("/api/v1/dashboard/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@dingtalk.test",
        password: "password12345",
        orgSlug: org.slug,
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const start = await app.request("/api/v1/dashboard/channel-connections/dingtalk/oauth/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, corpId: "ding-corp-1" }),
    });
    expect(start.status).toBe(200);
    const authorizeUrl = new URL(((await start.json()) as { authorizeUrl: string }).authorizeUrl);
    expect(authorizeUrl.origin).toBe("https://account.dingtalk.com");
    expect(authorizeUrl.pathname).toBe("/ding-corp-1/adminConsent");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("suite-key");
    const state = authorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ accessToken: "corp-token", expireIn: 7200 }));
    vi.stubGlobal("fetch", providerFetch);
    const callbackPath = `/api/v1/dashboard/channel-connections/dingtalk/oauth/callback?state=${encodeURIComponent(state ?? "")}&corp_id=ding-corp-1&admin_consent=True`;
    const callback = await app.request(callbackPath);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("dingtalk=connected");
    expect((await app.request(callbackPath)).status).toBe(400);
    expect(providerFetch).toHaveBeenCalledTimes(1);

    const [connection] = await store.db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.externalAccountId, "ding-corp-1"));
    if (!connection) throw new Error("dingtalk_connection_missing");
    expect(connection).toMatchObject({
      orgId: org.id,
      brandId: brand.id,
      channelType: "dingtalk",
      status: "active",
      transport: "stream",
    });
    const sealed = JSON.stringify(connection.credentials);
    expect(sealed).not.toContain("suite-secret");
    expect(sealed).not.toContain("secret-suite-ticket");
    expect(sealed).not.toContain("corp-token");
    expect(openChannelCredentials(connection.credentials, authConfig.jwtSecret)).toEqual({
      appType: "isv",
      suiteKey: "suite-key",
      corpId: "ding-corp-1",
    });

    const uninstall = await suiteCallback(app, aesKey, {
      EventType: "suite_relieve",
      SuiteKey: "suite-key",
      AuthCorpId: "ding-corp-1",
      TimeStamp: "1700000001",
    });
    expect(uninstall.response.status).toBe(200);
    expect(uninstall.message).toBe("success");
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
  payload: Record<string, unknown>,
) {
  const encrypted = encryptPayload(JSON.stringify(payload), aesKey, "suite-key");
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = "nonce";
  const signature = createHash("sha1")
    .update(["callback-token", timestamp, nonce, encrypted].sort().join(""))
    .digest("hex");
  const response = await app.request(
    `/api/v1/webhooks/im/dingtalk/suite?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encrypt: encrypted }),
    },
  );
  const wrapper = (await response.clone().json()) as {
    msg_signature: string;
    encrypt: string;
    timeStamp: string;
    nonce: string;
  };
  expect(
    verifyDingTalkSignature({
      token: "callback-token",
      timestamp: wrapper.timeStamp,
      nonce: wrapper.nonce,
      encrypted: wrapper.encrypt,
      signature: wrapper.msg_signature,
    }),
  ).toBe(true);
  return { response, message: decryptPayload(wrapper.encrypt, aesKey, "suite-key") };
}

function encryptPayload(message: string, aesKey: Buffer, suiteKey: string): string {
  const messageBytes = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.byteLength);
  const raw = Buffer.concat([randomBytes(16), length, messageBytes, Buffer.from(suiteKey)]);
  const padding = 32 - (raw.byteLength % 32);
  const cipher = createCipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(Buffer.concat([raw, Buffer.alloc(padding, padding)])),
    cipher.final(),
  ]).toString("base64");
}

function decryptPayload(encrypted: string, aesKey: Buffer, suiteKey: string): string {
  const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const padded = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  const padding = padded.at(-1) ?? 0;
  const raw = padded.subarray(0, padded.byteLength - padding);
  const length = raw.readUInt32BE(16);
  expect(raw.subarray(20 + length).toString("utf8")).toBe(suiteKey);
  return raw.subarray(20, 20 + length).toString("utf8");
}
