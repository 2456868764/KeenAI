import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";

/** P0-08: in-process API smoke (mirrors scripts/smoke.sh without a running server). */
describe("CI API smoke (P0-08)", () => {
  it("health → login → me → rbac → conversations", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;

    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    const [account] = await db
      .insert(accounts)
      .values({
        email: "owner@keenai.local",
        name: "Owner",
        passwordHash: await hashPassword("keenai-demo-12"),
      })
      .returning();

    if (!org || !account) throw new Error("fixture failed");

    await db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "owner",
      status: "active",
    });

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const health = await app.request("/health");
    expect(health.status).toBe(200);

    const apiHealth = await app.request("/api/v1/health");
    expect(apiHealth.status).toBe(200);
    const apiHealthBody = (await apiHealth.json()) as { status: string };
    expect(apiHealthBody.status).toBe("ok");

    const login = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@keenai.local",
        password: "keenai-demo-12",
        orgSlug: "demo",
      }),
    });
    expect(login.status).toBe(200);
    const tokens = (await login.json()) as { accessToken: string };
    expect(tokens.accessToken).toBeTruthy();

    const me = await app.request("/api/v1/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.status).toBe(200);

    const rbac = await app.request("/api/v1/rbac/check?resource=conversation&action=read", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(rbac.status).toBe(200);

    const conversations = await app.request("/api/v1/conversations", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(conversations.status).toBe(200);
    const inbox = (await conversations.json()) as { items: unknown[] };
    expect(Array.isArray(inbox.items)).toBe(true);

    await store.close();
  });
});
