import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  chunkKbDocumentHierarchical,
  createHelpCenterStubConnector,
  createKeenaiKb,
  embedKbChunkStub,
  parseKbDocument,
  parseKbMarkdownDocument,
} from "@keenai/kb";
import { chunkKbDocument } from "@keenai/kb";
import { createLibsqlKbChunkFtsStore, createLibsqlStore } from "@keenai/storage";
import { brands, kbChunkVectors, kbChunks, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`${label} missing`);
  return row;
}

describe("KB ingestion pipeline", () => {
  it("parses markdown into sections and chunks", () => {
    const parsed = parseKbDocument({
      title: "Export CSV",
      rawContent: "# Export CSV\n\nGo to Data Management.\n\n# Encoding\n\nChoose GBK for Chinese.",
    });
    expect(parsed.sections).toHaveLength(2);

    const chunks = chunkKbDocument(parsed);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.contextPrefix).toContain("Export CSV");
  });

  it("normalizes HTML and markdown hierarchy for KB-18 parsing", () => {
    const parsed = parseKbMarkdownDocument({
      title: "Billing Guide",
      contentType: "text/html",
      rawContent: `
        <h1>Billing</h1>
        <p>Use <strong>Invoices</strong> for receipts.</p>
        <h2>Refunds</h2>
        <ul><li>Open the billing page.</li><li>Choose refund request.</li></ul>
        <h2>Refunds</h2>
        <p>Duplicate headings get stable unique ids.</p>
      `,
    });

    expect(parsed.sections.map((section) => section.heading)).toEqual([
      "Billing",
      "Refunds",
      "Refunds",
    ]);
    expect(parsed.sections[1]?.path).toEqual(["Billing", "Refunds"]);
    expect(parsed.sections[1]?.body).toContain("- Open the billing page.");
    expect(parsed.sections[2]?.id).toBe("billing-refunds-2");
  });

  it("chunks on paragraph and sentence boundaries with context overlap", () => {
    const parsed = parseKbDocument({
      title: "Troubleshooting",
      rawContent:
        "# Reset device\n\nFirst sentence explains the reset flow. Second sentence keeps context for the next chunk.\n\nThird paragraph includes the final recovery step.",
    });

    const chunks = chunkKbDocumentHierarchical(parsed, 80, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.content.endsWith("flow.")).toBe(true);
    expect(chunks[1]?.content).toContain("Second sentence");
    expect(chunks[1]?.contextPrefix).toBe("Troubleshooting > Reset device");
  });

  it("indexes a document with stub embeddings", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "ingest", name: "Ingest" })
      .returning();
    const org = requireRow(orgRow[0], "org");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow[0], "brand");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    const kbSource = requireRow(source, "source");

    const kb = createKeenaiKb({ db });
    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const sync = await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createHelpCenterStubConnector(),
    });
    expect(sync.synced).toBeGreaterThan(0);

    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    const doc = requireRow(documents[0], "document");

    const result = await kb.indexDocument({
      orgId: org.id,
      brandId: brand.id,
      documentId: doc.id,
      chunkFtsIndexer: chunkFts,
    });

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.embedded).toBe(result.chunkCount);

    const chunks = await db.select().from(kbChunks).where(eq(kbChunks.documentId, doc.id));
    expect(chunks.length).toBe(result.chunkCount);

    const vectors = await db
      .select()
      .from(kbChunkVectors)
      .where(eq(kbChunkVectors.chunkId, requireRow(chunks[0], "chunk").id));
    expect(vectors).toHaveLength(1);

    const vector = embedKbChunkStub(requireRow(chunks[0], "chunk").content);
    expect(JSON.parse(vectors[0]?.embeddingJson ?? "[]")).toEqual(vector.embedding);

    await store.close();
  });
});
