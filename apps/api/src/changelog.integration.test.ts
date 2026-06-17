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

describe("changelog integration", () => {
  it("creates entry with audience segments, publishes, and public read", async () => {
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

    const created = await app.request("/api/v1/changelog/entries", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        slug: "dark-mode",
        title: "Dark mode is here",
        summary: "Dashboard and widget now support dark theme.",
        plainText: "We shipped dark mode across the product.",
        categoryTags: ["new", "improved"],
        audienceFilter: {
          segments: [
            { name: "Pro Plan", plan: "pro" },
            { name: "EU users", countries: ["DE", "FR"] },
          ],
        },
      }),
    });
    expect(created.status).toBe(201);
    const { entry } = (await created.json()) as { entry: { id: string; status: string } };
    expect(entry.status).toBe("draft");

    const published = await app.request(`/api/v1/changelog/entries/${entry.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    expect(published.status).toBe(200);
    const pubBody = (await published.json()) as {
      entry: { status: string; publishedAt: string | null };
    };
    expect(pubBody.entry.status).toBe("published");
    expect(pubBody.entry.publishedAt).toBeTruthy();

    const list = await app.request("/api/v1/public/acme/changelog/entries");
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: { slug: string }[] };
    expect(listBody.items.some((row) => row.slug === "dark-mode")).toBe(true);

    const detail = await app.request("/api/v1/public/acme/changelog/entries/dark-mode");
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      entry: { audienceFilter: { segments: { name: string }[] } };
    };
    expect(detailBody.entry.audienceFilter.segments).toHaveLength(2);

    await store.close();
  });
});
