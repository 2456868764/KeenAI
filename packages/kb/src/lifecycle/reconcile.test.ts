import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import {
  brands,
  kbChunks,
  kbDocuments,
  kbSources,
  kbSupersessionProposals,
  organizations,
} from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { detectKbContradictions, proposeKbSupersession } from "./reconcile.js";

describe("KB-20 reconcile", () => {
  it("creates supersession proposal on overlap", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "rec", name: "Rec" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org?.id ?? "", brandId: brand?.id, type: "help_center", name: "Help" })
      .returning();
    const [doc] = await db
      .insert(kbDocuments)
      .values({
        orgId: org?.id ?? "",
        brandId: brand?.id,
        sourceId: source?.id ?? "",
        title: "Billing FAQ",
        rawContent: "billing invoice export",
      })
      .returning();
    await db.insert(kbChunks).values({
      orgId: org?.id ?? "",
      brandId: brand?.id,
      documentId: doc?.id ?? "",
      chunkIndex: 0,
      content: "How to export billing invoices from dashboard settings menu",
    });

    const hits = await detectKbContradictions(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      question: "export billing invoice",
      answer: "Use dashboard billing export for invoices",
    });
    expect(hits.length).toBeGreaterThan(0);

    const { proposalId } = await proposeKbSupersession(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      conflictsWithDocumentId: hits[0]?.documentId ?? "",
      reason: hits[0]?.reason ?? "overlap",
    });
    const proposals = await db.select().from(kbSupersessionProposals);
    expect(proposals.some((row) => row.id === proposalId)).toBe(true);

    await store.close();
  });
});
