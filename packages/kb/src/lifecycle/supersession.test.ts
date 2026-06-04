import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { brands, kbChunks, kbDocuments, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { listKbDocumentSupersessionChain, supersedeKbDocument } from "./supersession.js";

describe("KB-14 supersession", () => {
  it("links documents and marks prior chunks superseded", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const orgRow = await db.insert(organizations).values({ slug: "sup", name: "Sup" }).returning();
    const org = orgRow[0];
    if (!org) throw new Error("org missing");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = brandRow[0];
    if (!brand) throw new Error("brand missing");
    const sourceRow = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    const source = sourceRow[0];
    if (!source) throw new Error("source missing");

    const oldDocRow = await db
      .insert(kbDocuments)
      .values({
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
        title: "Old",
        rawContent: "old",
      })
      .returning();
    const oldDoc = oldDocRow[0];
    if (!oldDoc) throw new Error("oldDoc missing");
    const newDocRow = await db
      .insert(kbDocuments)
      .values({
        orgId: org.id,
        brandId: brand.id,
        sourceId: source.id,
        title: "New",
        rawContent: "new",
      })
      .returning();
    const newDoc = newDocRow[0];
    if (!newDoc) throw new Error("newDoc missing");

    await db.insert(kbChunks).values({
      orgId: org.id,
      brandId: brand.id,
      documentId: oldDoc.id,
      chunkIndex: 0,
      content: "old chunk",
    });

    await supersedeKbDocument(db, {
      orgId: org.id,
      brandId: brand.id,
      documentId: newDoc.id,
      supersedesDocumentId: oldDoc.id,
    });

    const chain = await listKbDocumentSupersessionChain(db, {
      orgId: org.id,
      brandId: brand.id,
      documentId: newDoc.id,
    });
    expect(chain).toHaveLength(2);
    expect(chain[0]?.supersedesDocumentId).toBe(oldDoc.id);

    const oldChunks = await db.select().from(kbChunks).where(eq(kbChunks.documentId, oldDoc.id));
    const oldChunk = oldChunks[0];
    expect(oldChunk?.status).toBe("superseded");

    await store.close();
  });
});
