import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import {
  accounts,
  brands,
  feedbackBoards,
  feedbackPosts,
  kbQueryLogs,
  members,
  organizations,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@keenai/storage/schema";
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

describe("analytics integration", () => {
  it("returns dashboard metrics with breakdown series", async () => {
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

    const [typeRow] = await db
      .insert(ticketTypes)
      .values({ orgId: org.id, name: "Customer", kind: "customer" })
      .returning();
    const type = requireRow(typeRow, "type");
    const [statusRow] = await db
      .insert(ticketStatuses)
      .values({ orgId: org.id, name: "Open", category: "active" })
      .returning();
    const status = requireRow(statusRow, "status");

    await db.insert(tickets).values({
      orgId: org.id,
      typeId: type.id,
      title: "Billing issue",
      statusId: status.id,
    });

    const [boardRow] = await db
      .insert(feedbackBoards)
      .values({ orgId: org.id, brandId: brand.id, slug: "ideas", name: "Ideas" })
      .returning();
    const board = requireRow(boardRow, "board");
    await db.insert(feedbackPosts).values({
      orgId: org.id,
      boardId: board.id,
      title: "Dark mode",
      plainText: "Please add dark mode",
      upvoteCount: 12,
    });

    await db.insert(kbQueryLogs).values({
      orgId: org.id,
      brandId: brand.id,
      queryText: "reset password",
      userFeedback: "helpful",
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
    const res = await app.request("/api/v1/analytics/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dashboard: {
        support: { ticketCount: number; createdDaily: { day: string; count: number }[] };
        feedback: { postCount: number; topPosts: { title: string }[] };
        helpCenter: { searchCount: number; searchesDaily: unknown[] };
      };
    };

    expect(body.dashboard.support.ticketCount).toBe(1);
    expect(body.dashboard.support.createdDaily).toHaveLength(14);
    expect(body.dashboard.feedback.postCount).toBe(1);
    expect(body.dashboard.feedback.topPosts[0]?.title).toBe("Dark mode");
    expect(body.dashboard.helpCenter.searchCount).toBe(1);
    expect(body.dashboard.helpCenter.searchesDaily).toHaveLength(14);

    await store.close();
  });
});
