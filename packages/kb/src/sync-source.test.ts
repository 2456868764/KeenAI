import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHelpCenterStubConnector,
  createKeenaiKb,
  createWebCrawlStubConnector,
  getKbStubConnector,
} from "@keenai/kb";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("KB source connectors", () => {
  it("syncs help center stub documents into kb_documents", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "kbsync", name: "KBSync" })
      .returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const [source] = await db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "help_center",
        name: "Help Center",
      })
      .returning();
    const kbSource = requireRow(source, "source");

    const kb = createKeenaiKb({ db });
    const connector = getKbStubConnector("help_center");
    expect(connector).not.toBeNull();

    const result = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: connector ?? createHelpCenterStubConnector(),
    });

    expect(result.listed).toBe(2);
    expect(result.synced).toBe(2);

    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents).toHaveLength(2);
    expect(documents.some((doc) => doc.title === "Billing FAQ")).toBe(true);

    const [updatedSource] = await db.select().from(kbSources).where(eq(kbSources.id, kbSource.id));
    expect(updatedSource?.documentCount).toBe(2);
    expect(updatedSource?.lastSyncedAt).toBeTruthy();

    await store.close();
  });

  it("syncs web crawl stub documents", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db.insert(organizations).values({ slug: "web", name: "Web" }).returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const [source] = await db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "web",
        name: "Docs site",
      })
      .returning();
    const kbSource = requireRow(source, "source");

    const kb = createKeenaiKb({ db });
    const result = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createWebCrawlStubConnector(),
    });

    expect(result.synced).toBe(1);
    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents[0]?.title).toBe("Getting Started");

    await store.close();
  });
});
