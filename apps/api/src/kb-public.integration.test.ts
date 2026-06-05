import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, helpArticles, helpCollections, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

describe("public help center integration", () => {
  it("lists collections and article detail from help_articles", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db.insert(organizations).values({ slug: "hc", name: "HC" }).returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");

    const [collectionRow] = await db
      .insert(helpCollections)
      .values({
        orgId: org.id,
        brandId: brand.id,
        slug: "account",
        name: "Account",
        public: true,
      })
      .returning();
    const collection = requireRow(collectionRow, "collection");

    const [docRow] = await db
      .insert(helpArticles)
      .values({
        orgId: org.id,
        brandId: brand.id,
        collectionId: collection.id,
        slug: "reset-password",
        title: "Reset password",
        plainText: "Go to settings and click reset password.",
        status: "published",
        publishedAt: new Date(),
        seoTitle: "Reset your password",
        seoDescription: "Step-by-step password reset guide",
      })
      .returning();
    const doc = requireRow(docRow, "doc");

    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      PORTAL_PUBLIC_READ: "true",
    });
    const app = createApp({
      store,
      fts: null,
      authConfig: {
        jwtSecret: "test-secret-at-least-32-characters-long!!",
        accessTtlSec: 900,
        refreshTtlSec: 604_800,
        appUrl: "http://localhost:3000",
      },
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const meta = await app.request("/api/v1/public/hc/meta");
    expect(meta.status).toBe(200);
    const metaBody = (await meta.json()) as { brand: { id: string } };
    expect(metaBody.brand.id).toBe(brand.id);

    const collections = await app.request("/api/v1/public/hc/kb/collections");
    expect(collections.status).toBe(200);
    const colBody = (await collections.json()) as { items: { slug: string }[] };
    expect(colBody.items.some((c) => c.slug === "account")).toBe(true);

    const articles = await app.request("/api/v1/public/hc/kb/articles?collection=account");
    expect(articles.status).toBe(200);
    const artBody = (await articles.json()) as { items: { id: string; title: string }[] };
    expect(artBody.items.some((a) => a.id === doc.id)).toBe(true);

    const detail = await app.request(`/api/v1/public/hc/kb/articles/${doc.id}`);
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      article: { body: string; content: Record<string, unknown>; seoTitle: string | null };
    };
    expect(detailBody.article.body).toContain("reset password");
    expect(detailBody.article.content).toBeDefined();
    expect(detailBody.article.seoTitle).toBe("Reset your password");

    await store.close();
  });
});
