import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  kbCandidates,
  kbSources,
  members,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

describe("kb dispatch on conversation close", () => {
  it("crystallizes when closed with CSAT rating", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [account] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    await db.insert(members).values({
      orgId: org?.id ?? "",
      accountId: account?.id ?? "",
      role: "admin",
      status: "active",
    });
    await db.insert(kbSources).values({
      orgId: org?.id ?? "",
      brandId: brand?.id,
      type: "resolved_conversations",
      name: "Resolved",
      config: {
        kbSchema: { qualityGates: { crystallizeAutoMin: 0.95, crystallizeCandidateMin: 0.5 } },
      },
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

    const login = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "agent@acme.test",
        password: "password12345",
        orgSlug: "acme",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand?.id,
        channelType: "messenger",
        channelId: "kb-close-1",
        initialMessage: { plainText: "How do I export data?" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ plainText: "Open settings and click export." }),
    });

    const closed = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed", rating: 5 }),
    });
    expect(closed.status).toBe(200);

    const candidates = await db
      .select()
      .from(kbCandidates)
      .where(eq(kbCandidates.conversationId, conversation.id));
    expect(candidates.length).toBeGreaterThan(0);

    await store.close();
  });

  it("skips crystallize when closed without rating", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/storage/migrations/libsql",
      ),
    });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "acme2", name: "Acme2" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [account] = await db
      .insert(accounts)
      .values({
        email: "agent2@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    await db.insert(members).values({
      orgId: org?.id ?? "",
      accountId: account?.id ?? "",
      role: "admin",
      status: "active",
    });
    await db.insert(kbSources).values({
      orgId: org?.id ?? "",
      brandId: brand?.id,
      type: "resolved_conversations",
      name: "Resolved",
      config: {},
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

    const login = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "agent2@acme.test",
        password: "password12345",
        orgSlug: "acme2",
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand?.id,
        channelType: "messenger",
        channelId: "kb-close-2",
        initialMessage: { plainText: "Question?" },
      }),
    });
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    await db.insert(messages).values({
      orgId: org?.id ?? "",
      conversationId: conversation.id,
      senderType: "agent",
      plainText: "Answer here with enough text for quality.",
      content: { type: "text", text: "Answer here with enough text for quality." },
      isInternal: false,
    });

    await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });

    const candidates = await db
      .select()
      .from(kbCandidates)
      .where(eq(kbCandidates.conversationId, conversation.id));
    expect(candidates).toHaveLength(0);

    await store.close();
  });
});
