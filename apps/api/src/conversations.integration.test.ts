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

describe("conversations integration", () => {
  it("create conversation, post message, list messages", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;

    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    if (!org) throw new Error("fixture failed");

    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const [account] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();

    if (!org || !brand || !account) throw new Error("fixture failed");

    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "admin",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
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
        channelId: "widget-1",
        subject: "Hello",
        initialMessage: { plainText: "Hi from customer" },
      }),
    });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    const reply = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ plainText: "Agent reply here" }),
    });
    expect(reply.status).toBe(201);

    const listed = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    expect(listed.status).toBe(200);
    const { items } = (await listed.json()) as { items: { plainText: string }[] };
    expect(items).toHaveLength(2);
    expect(items[0]?.plainText).toBe("Hi from customer");
    expect(items[1]?.plainText).toBe("Agent reply here");

    const inbox = await app.request("/api/v1/conversations", { headers: auth });
    expect(inbox.status).toBe(200);
    const listBody = (await inbox.json()) as { items: unknown[] };
    expect(listBody.items.length).toBeGreaterThanOrEqual(1);

    const closed = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closed.status).toBe(200);
    const closedBody = (await closed.json()) as { conversation: { status: string } };
    expect(closedBody.conversation.status).toBe("closed");

    await store.close();
  });
});
