import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, members, organizations } from "@keenai/storage/schema";
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

describe("auth integration", () => {
  it("login + /me", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;

    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    const [account] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();

    if (!org || !account) throw new Error("fixture failed");

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

    const login = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "agent@acme.test",
        password: "password12345",
        orgSlug: "acme",
      }),
    });
    expect(login.status).toBe(200);
    const tokens = (await login.json()) as { accessToken: string };
    expect(tokens.accessToken).toBeTruthy();

    const me = await app.request("/api/v1/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.status).toBe(200);
    const profile = (await me.json()) as { member: { role: string } };
    expect(profile.member.role).toBe("admin");

    await store.close();
  });
});
