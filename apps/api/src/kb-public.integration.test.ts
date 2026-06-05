import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbDocuments, kbSources, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

describe("public help center integration", () => {
  it("lists collections and article detail", async () => {
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
    const [sourceRow] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    const source = requireRow(sourceRow, "source");

    const [docRow] = await db
      .insert(kbDocuments)
      .values({
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
        title: "Reset password",
        rawContent: "Go to settings and click reset password.",
        metadata: { collection: "account", slug: "reset-password", public: true },
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
    const detailBody = (await detail.json()) as { article: { body: string } };
    expect(detailBody.article.body).toContain("reset password");

    await store.close();
  });
});
