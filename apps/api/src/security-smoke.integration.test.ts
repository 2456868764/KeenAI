import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { createLogger } from "./logger.js";

/** I112: minimal security smoke — JWT, widget HMAC, upload presign auth. */
describe("security smoke (I112)", () => {
  async function createSmokeApp() {
    const env = parseApiEnv({ NODE_ENV: "test" });
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const app = createApp({
      store,
      fts: null,
      authConfig: toAuthConfig(env),
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const [org] = await store.db
      .insert(organizations)
      .values({ slug: "smoke", name: "Smoke", plan: "free" })
      .returning();
    const [account] = await store.db
      .insert(accounts)
      .values({
        email: "agent@smoke.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    if (!org || !account) throw new Error("fixture failed");
    await store.db.insert(members).values({
      orgId: org.id,
      accountId: account.id,
      role: "owner",
    });
    await store.db.insert(brands).values({
      orgId: org.id,
      slug: "default",
      name: "Default",
    });

    return { app, env };
  }

  it("rejects unauthenticated GET /api/v1/me", async () => {
    const { app } = await createSmokeApp();
    const res = await app.request("/api/v1/me");
    expect(res.status).toBe(401);
  });

  it("rejects widget session with invalid HMAC", async () => {
    const { app } = await createSmokeApp();
    const res = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "smoke",
        brandSlug: "default",
        user: { id: "visitor-1", userHash: "0".repeat(64) },
      }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects upload presign without JWT", async () => {
    const { app } = await createSmokeApp();
    const res = await app.request("/api/v1/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test.png",
        contentType: "image/png",
        sizeBytes: 128,
      }),
    });
    expect(res.status).toBe(401);
  });
});
