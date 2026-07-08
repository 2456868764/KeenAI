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

async function seedKbDoc(input: {
  db: ReturnType<typeof createLibsqlStore>["db"];
  orgId: string;
  brandId: string;
  title: string;
  content: string;
}) {
  const [source] = await input.db
    .insert(kbSources)
    .values({ orgId: input.orgId, brandId: input.brandId, type: "help_center", name: "Help" })
    .returning();
  const [doc] = await input.db
    .insert(kbDocuments)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      sourceId: source?.id ?? "",
      title: input.title,
      rawContent: input.content,
    })
    .returning();
  await input.db.insert(kbChunks).values({
    orgId: input.orgId,
    brandId: input.brandId,
    documentId: doc?.id ?? "",
    chunkIndex: 0,
    content: input.content,
  });
  return doc;
}

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
    await seedKbDoc({
      db,
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      title: "Billing FAQ",
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

  it("detects policy signal conflicts beyond raw lexical overlap", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db
      .insert(organizations)
      .values({ slug: "signals", name: "Signals" })
      .returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    const doc = await seedKbDoc({
      db,
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      title: "Refund policy",
      content: "Refund requests are not available after purchase. Contact support for credit.",
    });

    const hits = await detectKbContradictions(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      question: "Can customers get money back?",
      answer: "Customers can request a refund within 30 days from the billing dashboard.",
      overlapThreshold: 0.9,
    });

    expect(hits[0]?.documentId).toBe(doc?.id);
    expect(hits[0]?.reason).toContain("policy_conflict:refund_allowed");
    expect(hits[0]?.contradictionScore).toBeGreaterThan(0.9);

    await store.close();
  });

  it("does not flag exact duplicate policy text as contradiction", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    await migrate(db, {
      migrationsFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../storage/migrations/libsql",
      ),
    });

    const [org] = await db.insert(organizations).values({ slug: "dupe", name: "Dupe" }).returning();
    const [brand] = await db
      .insert(brands)
      .values({ orgId: org?.id ?? "", slug: "default", name: "Default" })
      .returning();
    await seedKbDoc({
      db,
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      title: "Refund window",
      content: "Customers can request a refund within 30 days from the billing dashboard.",
    });

    const hits = await detectKbContradictions(db, {
      orgId: org?.id ?? "",
      brandId: brand?.id ?? "",
      question: "Can customers request a refund?",
      answer: "Customers can request a refund within 30 days from the billing dashboard.",
    });

    expect(hits).toHaveLength(0);
    await store.close();
  });
});
