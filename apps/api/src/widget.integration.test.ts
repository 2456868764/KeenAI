import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWidgetUserHash } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { toAuthConfig } from "./config.js";
import { widgetHmacSecret } from "./lib/widget.js";
import { createLogger } from "./logger.js";

describe("widget integration", () => {
  it("HMAC session, conversation, and messages", async () => {
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

    const db = store.db;
    const [org] = await db
      .insert(organizations)
      .values({ slug: "demo", name: "Demo", plan: "free" })
      .returning();
    if (!org) throw new Error("org");

    const [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    if (!brand) throw new Error("brand");

    const secret = widgetHmacSecret(env);
    const userId = "visitor-test-1";
    const userHash = createWidgetUserHash(secret, userId);

    const sessionRes = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "demo",
        brandSlug: "default",
        user: { id: userId, userHash, name: "Visitor" },
      }),
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as { accessToken: string };
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const convRes = await app.request("/api/v1/widget/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        initialMessage: { plainText: "Hello from widget" },
      }),
    });
    expect(convRes.status).toBe(201);
    const convBody = (await convRes.json()) as { conversation: { id: string }; created: boolean };
    expect(convBody.created).toBe(true);

    const msgRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ plainText: "Follow-up" }),
      },
    );
    expect(msgRes.status).toBe(201);

    const listRes = await app.request(
      `/api/v1/widget/conversations/${convBody.conversation.id}/messages`,
      { headers: auth },
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { plainText: string }[] };
    expect(list.items.length).toBeGreaterThanOrEqual(2);

    const badHash = await app.request("/api/v1/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: "demo",
        brandSlug: "default",
        user: { id: userId, userHash: "0".repeat(64) },
      }),
    });
    expect(badHash.status).toBe(401);

    await store.close();
  });
});
