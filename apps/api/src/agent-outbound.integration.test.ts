import dns from "node:dns/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("agent outbound integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses agent markdown with attachment ref into image message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "agent", name: "Agent" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const passwordHash = await hashPassword("keenai-demo-12");
    const [accountRow] = await db
      .insert(accounts)
      .values({ email: "owner@keenai.local", passwordHash, name: "Owner" })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-agent-outbound",
      ),
    });

    const app = createApp({
      store,
      fts: null,
      authConfig: {
        jwtSecret: "test-secret-at-least-32-characters-long!!",
        accessTtlSec: 900,
        refreshTtlSec: 604_800,
        appUrl: "http://localhost:3000",
      },
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "agent",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "agent-out",
        subject: "Screenshot help",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const presignRes = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "fix.png",
        contentType: "image/png",
        sizeBytes: PNG_1X1.byteLength,
      }),
    });
    const presigned = (await presignRes.json()) as { uploadUrl: string };
    const uploadPath = new URL(presigned.uploadUrl).pathname;
    const uploadRes = await app.request(uploadPath, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "image/png" },
      body: PNG_1X1,
    });
    const uploaded = (await uploadRes.json()) as { attachmentId: string };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "ai",
        agentOutboundText: `Please see the screenshot below.\n\n![fix](attachment:${uploaded.attachmentId})`,
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as {
      message: {
        plainText: string;
        messageKind: string;
        attachments: { id: string; contentType: string | null }[];
      };
    };
    expect(msgBody.message.plainText).toContain("Please see the screenshot below.");
    expect(msgBody.message.plainText).toContain("[Image: fix.png");
    expect(msgBody.message.messageKind).toBe("photo");
    expect(msgBody.message.attachments).toHaveLength(1);
    expect(msgBody.message.attachments[0]?.contentType).toContain("image/");

    await store.close();
  });

  it("resolves MEDIA storage key tags in agent outbound text", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "media", name: "Media" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const passwordHash = await hashPassword("keenai-demo-12");
    const [accountRow] = await db
      .insert(accounts)
      .values({ email: "owner@keenai.local", passwordHash, name: "Owner" })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-agent-outbound-media",
      ),
    });

    const app = createApp({
      store,
      fts: null,
      authConfig: {
        jwtSecret: "test-secret-at-least-32-characters-long!!",
        accessTtlSec: 900,
        refreshTtlSec: 604_800,
        appUrl: "http://localhost:3000",
      },
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "media",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "media-tag",
        subject: "Generated image",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const presignRes = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "gen.png",
        contentType: "image/png",
        sizeBytes: PNG_1X1.byteLength,
      }),
    });
    const presigned = (await presignRes.json()) as { uploadUrl: string; storageKey: string };
    const uploadPath = new URL(presigned.uploadUrl).pathname;
    await app.request(uploadPath, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "image/png" },
      body: PNG_1X1,
    });

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "ai",
        agentOutboundText: `Here is your diagram.\nMEDIA:${presigned.storageKey}`,
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as {
      message: { messageKind: string; attachments: unknown[] };
    };
    expect(msgBody.message.messageKind).toBe("photo");
    expect(msgBody.message.attachments).toHaveLength(1);

    await store.close();
  });

  it("downloads safe external image URLs into outbound attachments", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "url", name: "URL" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const passwordHash = await hashPassword("keenai-demo-12");
    const [accountRow] = await db
      .insert(accounts)
      .values({ email: "owner@keenai.local", passwordHash, name: "Owner" })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-agent-outbound-url",
      ),
    });

    const app = createApp({
      store,
      fts: null,
      authConfig: {
        jwtSecret: "test-secret-at-least-32-characters-long!!",
        accessTtlSec: 900,
        refreshTtlSec: 604_800,
        appUrl: "http://localhost:3000",
      },
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const lookupMock = vi.spyOn(dns, "lookup") as unknown as {
      mockResolvedValue: (value: { address: string; family: 4 | 6 }[]) => void;
    };
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(PNG_1X1, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": String(PNG_1X1.byteLength),
          },
        });
      }),
    );

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "url",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "url-out",
        subject: "Remote image",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "ai",
        agentOutboundText:
          "Here is the public diagram.\n\n![diagram](https://cdn.example.com/diagram.png)",
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as {
      message: {
        plainText: string;
        messageKind: string;
        attachments: {
          contentType: string | null;
          fileName: string | null;
          metadata?: { source?: string; visionSummary?: string };
        }[];
      };
    };
    expect(msgBody.message.messageKind).toBe("photo");
    expect(msgBody.message.plainText).toContain("Here is the public diagram.");
    expect(msgBody.message.attachments).toHaveLength(1);
    expect(msgBody.message.attachments[0]?.fileName).toBe("diagram.png");
    expect(msgBody.message.attachments[0]?.contentType).toBe("image/png");
    expect(msgBody.message.attachments[0]?.metadata?.source).toBe("agent_url");

    await store.close();
  });

  it("rejects unsafe external URLs in agent outbound text", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "ssrf", name: "SSRF" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const passwordHash = await hashPassword("keenai-demo-12");
    const [accountRow] = await db
      .insert(accounts)
      .values({ email: "owner@keenai.local", passwordHash, name: "Owner" })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../data/test-agent-outbound-ssrf",
      ),
    });

    const app = createApp({
      store,
      fts: null,
      authConfig: {
        jwtSecret: "test-secret-at-least-32-characters-long!!",
        accessTtlSec: 900,
        refreshTtlSec: 604_800,
        appUrl: "http://localhost:3000",
      },
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "ssrf",
      }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const convRes = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "ssrf-out",
        subject: "Unsafe image",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "ai",
        agentOutboundText: "![secret](http://127.0.0.1/admin.png)",
      }),
    });
    expect(msgRes.status).toBe(400);
    expect(await msgRes.json()).toEqual({ error: "invalid_attachments" });
    expect(fetchMock).not.toHaveBeenCalled();

    await store.close();
  });
});
