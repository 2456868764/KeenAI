import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, conversations, members, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

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

describe("SLA integration", () => {
  it("creates policy, office hours, and records breach thresholds", async () => {
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

    const policyRes = await app.request("/api/v1/sla/policies", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Urgent",
        firstResponseSec: 60,
        resolutionSec: 120,
        operationalHoursOnly: false,
      }),
    });
    expect(policyRes.status).toBe(201);

    const hoursRes = await app.request("/api/v1/sla/office-hours", {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone: "UTC",
        schedule: { mon: [{ start: "09:00", end: "17:00" }] },
        holidays: [],
      }),
    });
    expect(hoursRes.status).toBe(200);

    const conv = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "sla-1",
        subject: "SLA test",
        initialMessage: { plainText: "Help" },
      }),
    });
    expect(conv.status).toBe(201);
    const { conversation } = (await conv.json()) as { conversation: { id: string } };

    await db
      .update(conversations)
      .set({ createdAt: new Date(Date.now() - 90_000) })
      .where(eq(conversations.id, conversation.id));

    const evaluate = await app.request(`/api/v1/sla/conversations/${conversation.id}/evaluate`, {
      method: "POST",
      headers: auth,
    });
    expect(evaluate.status).toBe(200);
    const evalBody = (await evaluate.json()) as { breaches: { thresholdPct: number }[] };
    expect(evalBody.breaches.length).toBeGreaterThan(0);

    const breaches = await app.request(`/api/v1/sla/conversations/${conversation.id}/breaches`, {
      headers: auth,
    });
    expect(breaches.status).toBe(200);
    const breachBody = (await breaches.json()) as { items: { thresholdPct: number }[] };
    expect(breachBody.items.some((b) => b.thresholdPct === 50)).toBe(true);

    await store.close();
  });
});
