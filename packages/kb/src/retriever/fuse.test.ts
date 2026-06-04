import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHelpCenterStubConnector,
  createKeenaiKb,
  createStubKbQueryEmbedder,
  searchKbChunks,
} from "@keenai/kb";
import {
  createLibsqlKbChunkFtsStore,
  createLibsqlKbChunkVectorStore,
  createLibsqlStore,
} from "@keenai/storage";
import { brands, kbDocuments, kbSources, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import {
  KB_DIVERSIFY_MAX_PER_SECTION,
  KB_DIVERSIFY_MAX_PER_SOURCE,
  KB_RECENCY_HALF_LIFE_DAYS,
  applyKbRecency,
  applyKbSearchPostFuse,
  diversifyKbSearchHits,
  kbHitRankingScore,
  kbRecencyBoost,
} from "./fuse.js";

const NOW = new Date("2026-05-19T12:00:00.000Z").getTime();

describe("fuse KB-11", () => {
  it("decays recency boost with half-life", () => {
    const fresh = kbRecencyBoost(new Date(NOW - 7 * 86_400_000), { nowMs: NOW, halfLifeDays: 90 });
    const stale = kbRecencyBoost(new Date(NOW - 365 * 86_400_000), {
      nowMs: NOW,
      halfLifeDays: 90,
    });
    expect(fresh).toBeGreaterThan(stale);
    expect(fresh).toBeCloseTo(Math.exp((-7 * Math.LN2) / 90), 5);
  });

  it("applies recency multiplier to fused or rerank score", () => {
    const recent = applyKbRecency(
      {
        fusedScore: 1,
        sourceUpdatedAt: new Date(NOW - 1 * 86_400_000),
      },
      { nowMs: NOW, halfLifeDays: KB_RECENCY_HALF_LIFE_DAYS },
    );
    const old = applyKbRecency(
      {
        fusedScore: 1,
        sourceUpdatedAt: new Date(NOW - 400 * 86_400_000),
      },
      { nowMs: NOW, halfLifeDays: KB_RECENCY_HALF_LIFE_DAYS },
    );
    expect(recent.recencyBoost).toBeGreaterThan(old.recencyBoost);
    expect(recent.fusedScore).toBeGreaterThan(old.fusedScore);

    const reranked = applyKbRecency(
      { fusedScore: 0.5, rerankScore: 2, sourceUpdatedAt: new Date(NOW) },
      { nowMs: NOW },
    );
    expect(reranked.rerankScore).toBeGreaterThan(kbHitRankingScore({ fusedScore: 0.5 }));
    expect(reranked.fusedScore).toBe(0.5);
  });

  it("diversifies by source and section caps", () => {
    const hits = [
      { chunkId: "a1", sourceId: "s1", sectionId: "sec1", documentId: "d1", fusedScore: 3 },
      { chunkId: "a2", sourceId: "s1", sectionId: "sec1", documentId: "d1", fusedScore: 2 },
      { chunkId: "b1", sourceId: "s1", sectionId: "sec2", documentId: "d1", fusedScore: 1.5 },
      { chunkId: "c1", sourceId: "s2", sectionId: "sec3", documentId: "d2", fusedScore: 1 },
    ];

    const diverse = diversifyKbSearchHits(hits, {
      maxPerSource: KB_DIVERSIFY_MAX_PER_SOURCE,
      maxPerSection: KB_DIVERSIFY_MAX_PER_SECTION,
    });

    expect(diverse.map((h) => h.chunkId)).toEqual(["a1", "b1", "c1"]);
    expect(diverse.filter((h) => h.sourceId === "s1")).toHaveLength(2);
  });

  it("post-fuse resorts stale documents after recency", () => {
    const fused = applyKbSearchPostFuse(
      [
        {
          chunkId: "old",
          sourceId: "s1",
          sectionId: "x",
          documentId: "d1",
          fusedScore: 6,
          sourceUpdatedAt: new Date(NOW - 500 * 86_400_000),
        },
        {
          chunkId: "new",
          sourceId: "s1",
          sectionId: "y",
          documentId: "d1",
          fusedScore: 5,
          sourceUpdatedAt: new Date(NOW),
        },
      ],
      { nowMs: NOW, diversify: false },
    );
    expect(fused[0]?.chunkId).toBe("new");
  });

  it("search pipeline applies diversify after hydrate", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });
    const chunkFts = createLibsqlKbChunkFtsStore(store.client);
    const chunkVector = createLibsqlKbChunkVectorStore(store.client);

    const orgRow = await db
      .insert(organizations)
      .values({ slug: "fuse", name: "Fuse" })
      .returning();
    const org = orgRow[0];
    if (!org) throw new Error("org missing");
    const brandRow = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = brandRow[0];
    if (!brand) throw new Error("brand missing");

    const [source] = await db
      .insert(kbSources)
      .values({ orgId: org.id, brandId: brand.id, type: "help_center", name: "Help" })
      .returning();
    const kbSource = source;
    if (!kbSource) throw new Error("source missing");

    const kb = createKeenaiKb({ db });
    await kb.syncSource({
      orgId: org.id,
      brandId: brand.id,
      sourceId: kbSource.id,
      connector: createHelpCenterStubConnector(),
    });

    const documents = await kb.listDocuments({ orgId: org.id, brandId: brand.id });
    for (const document of documents) {
      await kb.indexDocument({
        orgId: org.id,
        brandId: brand.id,
        documentId: document.id,
        chunkFtsIndexer: chunkFts,
      });
    }

    const withoutDiversify = await searchKbChunks(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "billing",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      rerank: false,
      diversify: false,
      limit: 20,
    });

    const withDiversify = await searchKbChunks(db, {
      orgId: org.id,
      brandId: brand.id,
      q: "billing",
      chunkFts,
      chunkVector,
      queryEmbedder: createStubKbQueryEmbedder(),
      rerank: false,
      diversify: true,
      limit: 20,
    });

    if (withoutDiversify.hits.length > withDiversify.hits.length) {
      const sectionIds = new Set(withDiversify.hits.map((h) => h.sectionId ?? h.documentId));
      expect(sectionIds.size).toBeGreaterThanOrEqual(withDiversify.hits.length);
    }

    const billingDoc = documents.find((doc) => doc.title === "Billing FAQ");
    if (billingDoc) {
      await db
        .update(kbDocuments)
        .set({ sourceUpdatedAt: new Date(NOW - 400 * 86_400_000) })
        .where(eq(kbDocuments.id, billingDoc.id));

      const stale = await searchKbChunks(db, {
        orgId: org.id,
        brandId: brand.id,
        q: "billing invoice",
        chunkFts,
        chunkVector,
        queryEmbedder: createStubKbQueryEmbedder(),
        rerank: false,
        recency: true,
        diversify: false,
        limit: 5,
      });
      expect(stale.hits[0]?.recencyBoost).toBeDefined();
      expect(stale.hits[0]?.recencyBoost ?? 1).toBeLessThan(0.5);
    }

    await store.close();
  });
});
