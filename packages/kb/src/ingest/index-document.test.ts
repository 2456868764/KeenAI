import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import {
  chunkKbDocumentHierarchical,
  createHelpCenterStubConnector,
  createKeenaiKb,
  embedKbChunkStub,
  parseKbDocument,
  parseKbDocxDocument,
  parseKbMarkdownDocument,
  parseKbPdfDocument,
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

function createZipEntry(name: string, data: Buffer): Buffer {
  const compressed = deflateRawSync(data);
  const nameBytes = Buffer.from(name);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);
  return Buffer.concat([localHeader, nameBytes, compressed]);
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

  it("extracts text from PDF text operators for KB-18 parsing", () => {
    const parsed = parseKbPdfDocument({
      title: "PDF Manual",
      rawContent:
        "%PDF-1.4\n1 0 obj <<>> stream\nBT (Refund policy) Tj [(Open ) 20 (Billing settings)] TJ <446f6e65> Tj ET\nendstream\n%%EOF",
    });

    expect(parsed.plainText).toContain("Refund policy");
    expect(parsed.plainText).toContain("Open Billing settings");
    expect(parsed.plainText).toContain("Done");
    expect(chunkKbDocument(parsed)[0]?.content).toContain("Refund policy");
  });

  it("extracts text from DOCX word/document.xml for KB-18 parsing", () => {
    const xml = Buffer.from(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<w:document>",
        "<w:body>",
        "<w:p><w:r><w:t>Billing FAQ</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>Refund window is 30 days.</w:t></w:r></w:p>",
        "</w:body>",
        "</w:document>",
      ].join(""),
    );
    const docxPayload = Buffer.concat([createZipEntry("word/document.xml", xml)]).toString(
      "base64",
    );

    const parsed = parseKbDocxDocument({
      title: "DOCX Manual",
      rawContent: docxPayload,
    });

    expect(parsed.plainText).toContain("Billing FAQ");
    expect(parsed.plainText).toContain("Refund window is 30 days.");
    expect(chunkKbDocument(parsed)[0]?.content).toContain("Billing FAQ");
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
      contextualRetrieval: {
        generateContext: async ({ title, chunk }) =>
          `${title} contextual note for ${chunk.slice(0, 24)}`,
      },
    });

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.embedded).toBe(result.chunkCount);

    const chunks = await db.select().from(kbChunks).where(eq(kbChunks.documentId, doc.id));
    expect(chunks.length).toBe(result.chunkCount);
    expect(chunks[0]?.content).toContain("contextual note");
    expect(chunks[0]?.contextPrefix).toContain("contextual note");
    expect(chunks[0]?.permissions).toEqual({});

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
