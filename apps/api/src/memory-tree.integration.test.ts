import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { conversationMessageSourceRef, conversationScopeKey } from "@keenai/memory-tree";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  members,
  memoryChunks,
  memoryTreeBuffers,
  organizations,
} from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

describe("memory tree integration", () => {
  it("creates a content-addressed chunk when posting a conversation message", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "mt", name: "Memory Tree" })
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
        orgSlug: "mt",
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
        channelId: "mem-tree",
        subject: "Memory ingest",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "user",
        plainText: "I need help upgrading my plan.",
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as { message: { id: string } };

    const [chunk] = await db
      .select()
      .from(memoryChunks)
      .where(eq(memoryChunks.sourceRef, conversationMessageSourceRef(msgBody.message.id)));
    expect(chunk).toBeTruthy();
    expect(chunk?.lifecycle).toBe("buffered");
    expect(chunk?.fastScore).toBeGreaterThanOrEqual(0.5);
    expect(chunk?.bodyMd).toContain("I need help upgrading my plan.");
    expect(chunk?.id).toMatch(/^[a-f0-9]{64}$/);
    expect(chunk?.metadata).toMatchObject({
      extractChunkStatus: "stub",
    });

    const [buffer] = await db
      .select()
      .from(memoryTreeBuffers)
      .where(
        and(
          eq(memoryTreeBuffers.orgId, org.id),
          eq(memoryTreeBuffers.scopeKey, conversationScopeKey(conversation.id)),
        ),
      );
    expect(buffer?.leafIds).toContain(chunk?.id);

    await store.close();
  });

  it("drops low-value pleasantries via fast-score", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "mt2", name: "Memory Tree 2" })
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
      .values({ email: "owner2@keenai.local", passwordHash, name: "Owner" })
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
        email: "owner2@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "mt2",
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
        channelId: "mem-tree-2",
        subject: "Pleasantry",
      }),
    });
    const { conversation } = (await convRes.json()) as { conversation: { id: string } };

    const msgRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        senderType: "user",
        plainText: "谢谢",
      }),
    });
    expect(msgRes.status).toBe(201);
    const msgBody = (await msgRes.json()) as { message: { id: string } };

    const [chunk] = await db
      .select()
      .from(memoryChunks)
      .where(eq(memoryChunks.sourceRef, conversationMessageSourceRef(msgBody.message.id)));
    expect(chunk?.lifecycle).toBe("dropped");
    expect(chunk?.fastScore).toBeLessThan(0.5);

    await store.close();
  });
});
