import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  conversations,
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

describe("customer unresponsive workflow", () => {
  it("scan job runs workflow after agent reply with zero inactivity", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db.insert(organizations).values({ slug: "acme", name: "Acme" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id, slug: "default", name: "Default" })
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
      orgId: org?.id,
      accountId: account?.id,
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

    const createdWf = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nudge",
        brandId: brand?.id,
        definition: {
          trigger: "customer_unresponsive",
          inactivityMinutes: 0,
          blocks: [
            {
              id: "nudge",
              type: "send_message",
              plainText: "Still there? Happy to help if you have more questions.",
            },
          ],
        },
      }),
    });
    expect(createdWf.status).toBe(201);
    const { workflow } = (await createdWf.json()) as { workflow: { id: string } };

    await app.request(`/api/v1/workflows/${workflow.id}/publish`, {
      method: "POST",
      headers: auth,
    });

    const created = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand?.id,
        channelType: "messenger",
        channelId: "w1",
        subject: "Unresponsive test",
        initialMessage: { plainText: "Hello" },
      }),
    });
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ plainText: "We are here to help!" }),
    });

    const stale = new Date(Date.now() - 60_000);
    await db
      .update(messages)
      .set({ createdAt: stale })
      .where(eq(messages.conversationId, conversation.id));
    await db
      .update(conversations)
      .set({ lastMessageAt: stale })
      .where(eq(conversations.id, conversation.id));

    const scan = await app.request("/api/v1/workflows/jobs/scan-unresponsive", {
      method: "POST",
      headers: auth,
    });
    expect(scan.status).toBe(200);
    const scanBody = (await scan.json()) as { triggered: number };
    expect(scanBody.triggered).toBeGreaterThan(0);

    const messagesRes = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: auth,
    });
    const body = (await messagesRes.json()) as { items: { plainText: string }[] };
    expect(body.items.some((m) => m.plainText.includes("Still there? Happy to help"))).toBe(true);

    await store.close();
  });
});
