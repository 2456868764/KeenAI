import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFileUploadConnector,
  createGitHubConnector,
  createHelpCenterStubConnector,
  createKeenaiKb,
  createNotionConnector,
  createWebCrawlConnector,
  createWebCrawlStubConnector,
  getKbStubConnector,
  resolveKbConnectorForSource,
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

  it("syncs config-backed file upload documents", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "files", name: "Files" })
      .returning();
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");
    if (!org?.id) throw new Error("org missing");

    const [source] = await db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "file",
        name: "Uploaded files",
      })
      .returning();
    const kbSource = requireRow(source, "source");
    const kb = createKeenaiKb({ db });

    const result = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createFileUploadConnector({
        documents: [
          {
            externalId: "uploads/refund-policy.md",
            title: "Refund Policy",
            rawContent: "# Refund Policy\n\nRefunds are available within 14 days.",
            contentType: "text/markdown",
            canonicalLocale: "en",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      }),
    });

    expect(result).toMatchObject({ listed: 1, synced: 1, skipped: 0 });
    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents[0]?.title).toBe("Refund Policy");

    await store.close();
  });

  it("syncs config-backed web crawl documents", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "crawl", name: "Crawl" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    if (!org?.id || !brand?.id) throw new Error("fixture missing");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "web", name: "Docs" })
      .returning();
    const kbSource = requireRow(source, "source");
    const kb = createKeenaiKb({ db });

    const result = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createWebCrawlConnector(
        { urls: ["https://docs.example.com/refunds"] },
        {
          fetchFn: async (url) => ({
            ok: true,
            status: 200,
            url,
            headers: { get: (name) => (name === "content-type" ? "text/html" : null) },
            async text() {
              return "<html><title>Refunds</title><body><h1>Refunds</h1><p>Refunds are available in the portal.</p></body></html>";
            },
          }),
          now: () => new Date("2026-07-01T00:00:00.000Z"),
        },
      ),
    });

    expect(result.synced).toBe(1);
    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents[0]?.title).toBe("Refunds");

    await store.close();
  });

  it("syncs config-backed GitHub raw documents", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "github", name: "GitHub" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    if (!org?.id || !brand?.id) throw new Error("fixture missing");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "github", name: "GitHub Docs" })
      .returning();
    const kbSource = requireRow(source, "source");
    const kb = createKeenaiKb({ db });

    const result = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createGitHubConnector(
        {
          files: [
            {
              url: "https://raw.githubusercontent.com/keenai/docs/main/README.md",
              path: "README.md",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
        {
          fetchFn: async (url) => ({
            ok: true,
            status: 200,
            url,
            headers: { get: (name) => (name === "content-type" ? "text/markdown" : null) },
            async text() {
              return "# KeenAI README\n\nInstall with Docker or Helm.";
            },
          }),
        },
      ),
    });

    expect(result.synced).toBe(1);
    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents[0]?.title).toBe("README");

    await store.close();
  });

  it("syncs config-backed Notion pages", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "notion", name: "Notion" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    if (!org?.id || !brand?.id) throw new Error("fixture missing");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "notion", name: "Notion KB" })
      .returning();
    const kbSource = requireRow(source, "source");
    const kb = createKeenaiKb({ db });

    const result = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createNotionConnector(
        {
          token: "secret_notion",
          pageIds: [{ pageId: "page-1", updatedAt: "2026-07-01T00:00:00.000Z" }],
        },
        {
          fetchFn: async (url) => ({
            ok: true,
            status: 200,
            async json() {
              if (url.includes("/pages/")) {
                return {
                  properties: {
                    title: {
                      type: "title",
                      title: [{ plain_text: "Refund Playbook" }],
                    },
                  },
                };
              }
              return {
                results: [
                  { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Refunds" }] } },
                  {
                    type: "paragraph",
                    paragraph: { rich_text: [{ plain_text: "Approve refunds within 14 days." }] },
                  },
                ],
              };
            },
          }),
        },
      ),
    });

    expect(result.synced).toBe(1);
    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents[0]?.title).toBe("Refund Playbook");

    await store.close();
  });

  it("syncs all design-listed config-backed source connectors", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "extended-sources", name: "Extended Sources" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    if (!org?.id || !brand?.id) throw new Error("fixture missing");

    const sourceTypes = [
      "past_conversations",
      "feedback",
      "changelog",
      "roadmap",
      "confluence",
      "google_drive",
      "slack",
      "discord",
      "linear",
      "jira",
      "youtube",
      "sql",
    ] as const;
    const kb = createKeenaiKb({ db });

    for (const sourceType of sourceTypes) {
      const [source] = await db
        .insert(kbSources)
        .values({ orgId: org.id, brandId: brand.id, type: sourceType, name: sourceType })
        .returning();
      const kbSource = requireRow(source, sourceType);
      const connector = resolveKbConnectorForSource(sourceType, {
        documents: [
          {
            externalId: `${sourceType}:doc-1`,
            title: `${sourceType} KB document`,
            rawContent: `# ${sourceType}\n\nUse this ${sourceType} source for support context.`,
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      });
      expect(connector).not.toBeNull();
      expect(
        connector?.configSchema().safeParse({
          documents: [
            {
              rawContent: "Config schema proof",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        }).success,
      ).toBe(true);

      const result = await kb.syncSource({
        orgId: org.id,
        brandId: brand.id,
        sourceId: kbSource.id,
        connector: connector ?? createHelpCenterStubConnector(),
      });

      expect(result).toMatchObject({ listed: 1, synced: 1, skipped: 0 });
    }

    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    expect(documents).toHaveLength(sourceTypes.length);
    expect(documents.map((document) => document.title)).toContain("confluence KB document");

    await store.close();
  });
});
