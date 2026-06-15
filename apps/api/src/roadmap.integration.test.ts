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

describe("roadmap integration", () => {
  it("creates default roadmap, items, moves columns, and public read", async () => {
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

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      PORTAL_PUBLIC_READ: "true",
    });
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

    const ensure = await app.request(`/api/v1/roadmaps/ensure-default?brandId=${brand.id}`, {
      method: "POST",
      headers: auth,
    });
    expect(ensure.status).toBe(200);
    const { roadmap } = (await ensure.json()) as { roadmap: { id: string; slug: string } };
    expect(roadmap.slug).toBe("product");

    const created = await app.request(`/api/v1/roadmaps/${roadmap.id}/items`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Dark mode",
        description: "Ship dark theme across dashboard and widget",
        columnId: "planned",
      }),
    });
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { id: string; columnId: string } };
    expect(item.columnId).toBe("planned");

    const moved = await app.request(`/api/v1/roadmaps/${roadmap.id}/items/${item.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: "in_progress", sortOrder: 0 }),
    });
    expect(moved.status).toBe(200);
    const movedBody = (await moved.json()) as { item: { columnId: string } };
    expect(movedBody.item.columnId).toBe("in_progress");

    const list = await app.request(`/api/v1/roadmaps/${roadmap.id}/items`, { headers: auth });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: { id: string }[] };
    expect(listBody.items.some((row) => row.id === item.id)).toBe(true);

    const pub = await app.request("/api/v1/public/acme/roadmap/product/items");
    expect(pub.status).toBe(200);
    const pubBody = (await pub.json()) as { items: { title: string }[] };
    expect(pubBody.items.some((row) => row.title === "Dark mode")).toBe(true);

    const deleted = await app.request(`/api/v1/roadmaps/${roadmap.id}/items/${item.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleted.status).toBe(204);
  });
});
