import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbChunks, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
  KB_DOCUMENT_INDEXED_CHANNEL,
  KB_INGEST_NOTIFY_CHANNEL,
  type KbDocumentIndexedPayload,
  type KbIngestNotifyPayload,
  runKbIngestForSource,
} from "./kb-pipeline.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/storage/migrations/libsql",
);

async function createFixture() {
  const store = createLibsqlStore({ url: ":memory:" });
  await migrate(store.db, { migrationsFolder });
  const [org] = await store.db
    .insert(organizations)
    .values({ slug: "kb-pipeline", name: "KB Pipeline" })
    .returning();
  const [brand] = await store.db
    .insert(brands)
    .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
    .returning();
  if (!org?.id || !brand?.id) throw new Error("fixture_create_failed");
  return { store, org, brand };
}

describe("runKbIngestForSource", () => {
  const stores: Array<ReturnType<typeof createLibsqlStore>> = [];

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
  });

  it("syncs a source, indexes documents, updates status, and notifies", async () => {
    const { store, org, brand } = await createFixture();
    stores.push(store);
    const [source] = await store.db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    if (!source?.id) throw new Error("source_create_failed");
    const notifications: KbIngestNotifyPayload[] = [];
    const indexedNotifications: KbDocumentIndexedPayload[] = [];
    await store.listen<KbIngestNotifyPayload>(KB_INGEST_NOTIFY_CHANNEL, (payload) => {
      notifications.push(payload);
    });
    await store.listen<KbDocumentIndexedPayload>(KB_DOCUMENT_INDEXED_CHANNEL, (payload) => {
      indexedNotifications.push(payload);
    });

    const result = await runKbIngestForSource(store, {
      orgId: org.id,
      brandId: brand.id,
      sourceId: source.id,
    });

    expect(result.ok).toBe(true);
    expect(result.steps.find((step) => step.step === "fetch")?.detail).toBe("synced:2/2");
    expect(result.steps.find((step) => step.step === "index")?.metadata).toMatchObject({
      documents: 2,
      fts: true,
    });
    expect(notifications).toEqual([expect.objectContaining({ sourceId: source.id, ok: true })]);
    expect(indexedNotifications).toEqual([
      expect.objectContaining({
        sourceId: source.id,
        chunkCount: expect.any(Number),
        cacheInvalidated: true,
        agentReevaluationQueued: true,
      }),
    ]);
    expect(indexedNotifications[0]?.documentIds).toHaveLength(2);

    const [updatedSource] = await store.db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, source.id));
    expect(updatedSource?.status).toBe("active");
    expect(updatedSource?.error).toBeNull();
    expect(updatedSource?.documentCount).toBe(2);
    expect(updatedSource?.chunkCount).toBeGreaterThan(0);

    const chunks = await store.db.select().from(kbChunks).where(eq(kbChunks.brandId, brand.id));
    expect(chunks.length).toBe(updatedSource?.chunkCount);
  });

  it("marks unsupported source types as error", async () => {
    const { store, org, brand } = await createFixture();
    stores.push(store);
    const [source] = await store.db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "resolved_conversations",
        name: "Resolved conversations",
      })
      .returning();
    if (!source?.id) throw new Error("source_create_failed");

    await expect(
      runKbIngestForSource(store, {
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
      }),
    ).rejects.toThrow("kb_connector_unavailable:resolved_conversations");

    const [updatedSource] = await store.db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, source.id));
    expect(updatedSource?.status).toBe("error");
    expect(updatedSource?.error).toBe("connector_unavailable:resolved_conversations");
  });

  it("ingests config-backed file sources", async () => {
    const { store, org, brand } = await createFixture();
    stores.push(store);
    const [source] = await store.db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "file",
        name: "Files",
        config: {
          documents: [
            {
              externalId: "uploads/returns.md",
              title: "Returns",
              rawContent: "# Returns\n\nCustomers can request returns in the portal.",
              contentType: "text/markdown",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
      })
      .returning();
    if (!source?.id) throw new Error("source_create_failed");

    const result = await runKbIngestForSource(store, {
      orgId: org.id,
      brandId: brand.id,
      sourceId: source.id,
    });

    expect(result.ok).toBe(true);
    expect(result.steps.find((step) => step.step === "fetch")?.detail).toBe("synced:1/1");
    expect(result.steps.find((step) => step.step === "index")?.metadata).toMatchObject({
      documents: 1,
    });

    const [updatedSource] = await store.db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, source.id));
    expect(updatedSource?.status).toBe("active");
    expect(updatedSource?.documentCount).toBe(1);
    expect(updatedSource?.chunkCount).toBeGreaterThan(0);
  });

  it("ingests config-backed web sources", async () => {
    const { store, org, brand } = await createFixture();
    stores.push(store);
    const [source] = await store.db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "web",
        name: "Docs",
        config: {
          urls: [
            {
              url: "https://docs.example.com/local-fixture",
              title: "Local Fixture",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
      })
      .returning();
    if (!source?.id) throw new Error("source_create_failed");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) =>
      new Response(
        "<html><title>Local Fixture</title><body><p>Install with docker compose.</p></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      )) as typeof fetch;
    try {
      const result = await runKbIngestForSource(store, {
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
      });

      expect(result.ok).toBe(true);
      expect(result.steps.find((step) => step.step === "fetch")?.detail).toBe("synced:1/1");
      expect(result.steps.find((step) => step.step === "index")?.metadata).toMatchObject({
        documents: 1,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const [updatedSource] = await store.db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, source.id));
    expect(updatedSource?.status).toBe("active");
    expect(updatedSource?.documentCount).toBe(1);
    expect(updatedSource?.chunkCount).toBeGreaterThan(0);
  });

  it("ingests config-backed GitHub sources", async () => {
    const { store, org, brand } = await createFixture();
    stores.push(store);
    const [source] = await store.db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "github",
        name: "GitHub",
        config: {
          files: [
            {
              url: "https://raw.githubusercontent.com/keenai/docs/main/README.md",
              path: "README.md",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
      })
      .returning();
    if (!source?.id) throw new Error("source_create_failed");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("# KeenAI README\n\nInstall with Docker or Helm.", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      })) as unknown as typeof fetch;
    try {
      const result = await runKbIngestForSource(store, {
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
      });

      expect(result.ok).toBe(true);
      expect(result.steps.find((step) => step.step === "fetch")?.detail).toBe("synced:1/1");
      expect(result.steps.find((step) => step.step === "index")?.metadata).toMatchObject({
        documents: 1,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const [updatedSource] = await store.db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, source.id));
    expect(updatedSource?.status).toBe("active");
    expect(updatedSource?.documentCount).toBe(1);
    expect(updatedSource?.chunkCount).toBeGreaterThan(0);
  });

  it("ingests config-backed Notion sources", async () => {
    const { store, org, brand } = await createFixture();
    stores.push(store);
    const [source] = await store.db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "notion",
        name: "Notion",
        config: {
          token: "secret_notion",
          pageIds: [{ pageId: "page-1", updatedAt: "2026-07-01T00:00:00.000Z" }],
        },
      })
      .returning();
    if (!source?.id) throw new Error("source_create_failed");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) =>
      new Response(
        JSON.stringify(
          String(url).includes("/pages/")
            ? {
                properties: {
                  title: { type: "title", title: [{ plain_text: "Refund Playbook" }] },
                },
              }
            : {
                results: [
                  {
                    type: "paragraph",
                    paragraph: { rich_text: [{ plain_text: "Refunds are approved in 14 days." }] },
                  },
                ],
              },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    try {
      const result = await runKbIngestForSource(store, {
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
      });

      expect(result.ok).toBe(true);
      expect(result.steps.find((step) => step.step === "fetch")?.detail).toBe("synced:1/1");
      expect(result.steps.find((step) => step.step === "index")?.metadata).toMatchObject({
        documents: 1,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const [updatedSource] = await store.db
      .select()
      .from(kbSources)
      .where(eq(kbSources.id, source.id));
    expect(updatedSource?.status).toBe("active");
    expect(updatedSource?.documentCount).toBe(1);
    expect(updatedSource?.chunkCount).toBeGreaterThan(0);
  });
});
