import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, kbDocuments, members, organizations } from "@keenai/storage/schema";
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
      orgSlug: "hc-org",
    }),
  });
  expect(login.status).toBe(200);
  const tokens = (await login.json()) as { accessToken: string };
  return tokens.accessToken;
}

describe("help center integration", () => {
  it("creates collection, article, publishes and syncs kb document", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "hc-org", name: "HC Org" })
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

    const accessToken = await loginToken(app);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const collectionRes = await app.request("/api/v1/help-center/collections", {
      method: "POST",
      headers,
      body: JSON.stringify({
        brandId: brand.id,
        slug: "account",
        name: "Account",
      }),
    });
    expect(collectionRes.status).toBe(201);
    const collectionBody = (await collectionRes.json()) as { collection: { id: string } };

    const articleRes = await app.request("/api/v1/help-center/articles", {
      method: "POST",
      headers,
      body: JSON.stringify({
        brandId: brand.id,
        collectionId: collectionBody.collection.id,
        slug: "reset-password",
        title: "Reset password",
        plainText: "Go to settings and click reset password.",
      }),
    });
    expect(articleRes.status).toBe(201);
    const articleBody = (await articleRes.json()) as { article: { id: string } };

    const publishRes = await app.request(`/api/v1/help-center/articles/${articleBody.article.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "published" }),
    });
    expect(publishRes.status).toBe(200);
    const published = (await publishRes.json()) as { article: { kbDocumentId: string | null } };
    expect(published.article.kbDocumentId).toBeTruthy();

    const kbRows = await db.select().from(kbDocuments);
    expect(kbRows.some((row) => row.externalId === articleBody.article.id)).toBe(true);

    const publicCollections = await app.request("/api/v1/public/hc-org/kb/collections");
    expect(publicCollections.status).toBe(200);
    const colBody = (await publicCollections.json()) as { items: { slug: string }[] };
    expect(colBody.items.some((c) => c.slug === "account")).toBe(true);

    const publicArticle = await app.request(
      `/api/v1/public/hc-org/kb/articles/${articleBody.article.id}`,
    );
    expect(publicArticle.status).toBe(200);
    const detailBody = (await publicArticle.json()) as { article: { body: string } };
    expect(detailBody.article.body).toContain("reset password");

    await store.close();
  });
});
