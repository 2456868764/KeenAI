import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

async function loginToken(app: ReturnType<typeof createApp>) {
  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "agent@acme.test",
      password: "password12345",
      orgSlug: "acme",
    }),
  });
  const tokens = (await login.json()) as { accessToken: string };
  return tokens.accessToken;
}

describe("copilot integration", () => {
  it("streams stub draft and records accept event", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    await db.insert(members).values({
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

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "w1",
        subject: "Refund",
        initialMessage: { plainText: "Please refund order 42" },
      }),
    });
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const draftRes = await app.request("/api/v1/copilot/draft", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    expect(draftRes.status).toBe(200);
    const body = await draftRes.text();
    expect(body).toContain('"providerId":"stub"');
    expect(body).toContain('"memoryScope":"conversation"');
    expect(body).toContain("Keeni");
    expect(body).toContain("Guardrails");
    // Stub stream emits ~12-char JSON chunks; user message may split across chunk boundaries.
    expect(body).toContain("fund order 4");

    const eventRes = await app.request("/api/v1/copilot/events", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        action: "accept",
        draftLength: 120,
        providerId: "stub",
      }),
    });
    expect(eventRes.status).toBe(201);

    const macros = await app.request("/api/v1/macros", { headers: auth });
    expect(macros.status).toBe(200);
    const macroBody = (await macros.json()) as { items: { slug: string }[] };
    expect(macroBody.items.some((m) => m.slug === "refund")).toBe(true);

    const providerList = await app.request("/api/v1/copilot/providers", { headers: auth });
    expect(providerList.status).toBe(200);
    const providerBody = (await providerList.json()) as {
      defaultProviderId: string;
      items: { id: string; label: string }[];
    };
    expect(providerBody.defaultProviderId).toBe("stub");
    expect(providerBody.items.some((p) => p.id === "stub")).toBe(true);

    await store.close();
  });

  it("includes image attachments in stub copilot draft context", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        passwordHash: await hashPassword("password12345"),
        name: "Agent",
      })
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
        "../../data/test-copilot-vision",
      ),
    });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "w-vision",
        subject: "Broken screen",
      }),
    });
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const presignRes = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "screen.png",
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
    expect(uploadRes.status).toBe(200);
    const uploaded = (await uploadRes.json()) as { attachmentId: string };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        plainText: "My phone screen is cracked — see photo",
        attachmentIds: [uploaded.attachmentId],
      }),
    });

    const draftRes = await app.request("/api/v1/copilot/draft", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    expect(draftRes.status).toBe(200);
    const body = await draftRes.text();
    expect(body).toContain("image");

    await store.close();
  });
});
