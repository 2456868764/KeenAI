import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlFtsStore, createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
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

async function loginToken(app: ReturnType<typeof createApp>, email: string) {
  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password12345", orgSlug: "acme" }),
  });
  const tokens = (await login.json()) as { accessToken: string };
  return tokens.accessToken;
}

describe("notifications and search integration", () => {
  it("creates assign notification and finds conversation via FTS", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const fts = createLibsqlFtsStore(store.client);

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org!.id, slug: "default", name: "Default" })
      .returning();
    const [owner] = await db
      .insert(accounts)
      .values({
        email: "owner@acme.test",
        name: "Owner",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const [agent] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();

    await db
      .insert(members)
      .values({ orgId: org!.id, accountId: owner!.id, role: "admin", status: "active" });
    const [agentMember] = await db
      .insert(members)
      .values({ orgId: org!.id, accountId: agent!.id, role: "agent", status: "active" })
      .returning();

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const ownerToken = await loginToken(app, "owner@acme.test");
    const agentToken = await loginToken(app, "agent@acme.test");

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brandId: brand!.id,
        channelType: "messenger",
        channelId: "widget-1",
        subject: "Refund request",
        initialMessage: { plainText: "I need a refund for order 42" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const assigned = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ assigneeId: agentMember!.id }),
    });
    expect(assigned.status).toBe(200);

    const notifs = await app.request("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    expect(notifs.status).toBe(200);
    const notifBody = (await notifs.json()) as {
      items: { eventType: string }[];
      unreadCount: number;
    };
    expect(notifBody.unreadCount).toBeGreaterThanOrEqual(1);
    expect(notifBody.items.some((n) => n.eventType === "conversation.assigned")).toBe(true);

    const search = await app.request("/api/v1/search/conversations?q=refund", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(search.status).toBe(200);
    const searchBody = (await search.json()) as { items: { id: string }[] };
    expect(searchBody.items.some((i) => i.id === conversation.id)).toBe(true);

    await store.close();
  });
});
