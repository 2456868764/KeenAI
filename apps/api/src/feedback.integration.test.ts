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

describe("feedback integration", () => {
  it("creates board, posts, votes, dedupes, and comments", async () => {
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

    const ensure = await app.request(`/api/v1/feedback/boards/ensure-default?brandId=${brand.id}`, {
      method: "POST",
      headers: auth,
    });
    expect(ensure.status).toBe(200);

    const created = await app.request("/api/v1/feedback/boards/ideas/posts", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Dark mode",
        plainText: "Please add dark mode to the dashboard",
      }),
    });
    expect(created.status).toBe(201);
    const { post } = (await created.json()) as { post: { id: string; upvoteCount: number } };

    const duplicate = await app.request(
      "/api/v1/feedback/boards/ideas/dedup?plainText=add%20dark%20mode%20dashboard&threshold=0.5",
      {
        headers: auth,
      },
    );
    expect(duplicate.status).toBe(200);
    const dedupBody = (await duplicate.json()) as {
      matches: { post: { id: string }; method: string }[];
    };
    expect(dedupBody.matches.some((m) => m.post.id === post.id)).toBe(true);

    const embedDedup = await app.request(
      `/api/v1/feedback/boards/ideas/dedup?${new URLSearchParams({
        title: "Dark mode",
        plainText: "Please add dark mode to the dashboard",
        threshold: "0.99",
      })}`,
      { headers: auth },
    );
    expect(embedDedup.status).toBe(200);
    const embedBody = (await embedDedup.json()) as {
      matches: { post: { id: string }; method: string; score: number }[];
    };
    const embedMatch = embedBody.matches.find((m) => m.post.id === post.id);
    expect(embedMatch).toBeTruthy();
    expect(["embedding", "both", "lexical"]).toContain(embedMatch?.method);
    expect(embedMatch?.score ?? 0).toBeGreaterThanOrEqual(0.99);

    const voted = await app.request(`/api/v1/feedback/posts/${post.id}/vote`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-1" }),
    });
    expect(voted.status).toBe(200);
    const voteBody = (await voted.json()) as { post: { upvoteCount: number } };
    expect(voteBody.post.upvoteCount).toBeGreaterThanOrEqual(1);

    const commented = await app.request(`/api/v1/feedback/posts/${post.id}/comments`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ plainText: "+1 from enterprise customer" }),
    });
    expect(commented.status).toBe(201);

    await store.close();
  });
});
