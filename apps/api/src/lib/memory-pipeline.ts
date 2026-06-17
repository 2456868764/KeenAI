import {
  type BrandDailyDigestPayload,
  extractFactsFromSummary,
  extractKgFromSummary,
  flushStaleBuffers,
  processAdmittedChunk,
  runBrandDailyDigestStub,
  runMemoryConsolidation,
  runMemoryDecaySweep,
} from "@keenai/memory-tree";
import type { KeenaiDb } from "@keenai/storage";
import { getMemoryFactExtractor } from "./memory-fact-extract-init.js";
import { getMemoryKgExtractor } from "./memory-kg-extract-init.js";
import { getMemorySummaryFtsIndexer } from "./memory-summary-fts-init.js";

export async function runProcessAdmittedChunk(
  db: KeenaiDb,
  payload: { orgId: string; brandId: string; chunkId: string },
) {
  return processAdmittedChunk(db, {
    ...payload,
    summaryFtsIndexer: getMemorySummaryFtsIndexer(),
  });
}

export async function runDigestDailyPipeline(db: KeenaiDb, payload?: BrandDailyDigestPayload) {
  return runBrandDailyDigestStub(db, payload, {
    summaryFtsIndexer: getMemorySummaryFtsIndexer(),
  });
}

export async function runExtractFactsForSummary(
  db: KeenaiDb,
  payload: { orgId: string; brandId: string; summaryId: string },
) {
  const extractor = getMemoryFactExtractor();
  if (!extractor) {
    return {
      extracted: false,
      summaryId: payload.summaryId,
      scope: "",
      scopeId: "",
      factCount: 0,
      slotCount: 0,
      reason: "extract_disabled",
    };
  }

  return extractFactsFromSummary(db, {
    ...payload,
    factExtractor: extractor,
  });
}

export async function runExtractEntitiesForSummary(
  db: KeenaiDb,
  payload: { orgId: string; brandId: string; summaryId: string },
) {
  const result = await extractKgFromSummary(db, {
    ...payload,
    kgExtractor: getMemoryKgExtractor(),
  });
  return result.entityResult;
}

export async function runExtractRelationsForSummary(
  db: KeenaiDb,
  payload: { orgId: string; brandId: string; summaryId: string },
) {
  const result = await extractKgFromSummary(db, {
    ...payload,
    kgExtractor: getMemoryKgExtractor(),
  });
  return result.relationResult;
}

export async function runExtractEntitiesAndRelationsForSummary(
  db: KeenaiDb,
  payload: { orgId: string; brandId: string; summaryId: string },
) {
  const result = await extractKgFromSummary(db, {
    ...payload,
    kgExtractor: getMemoryKgExtractor(),
  });
  return { entityResult: result.entityResult, relationResult: result.relationResult };
}

export async function runFlushStaleBuffers(db: KeenaiDb) {
  const result = await flushStaleBuffers(db, {
    summaryFtsIndexer: getMemorySummaryFtsIndexer(),
  });

  for (const row of result.results) {
    if (!row.summaryId) continue;
    await runExtractFactsForSummary(db, {
      orgId: row.orgId,
      brandId: row.brandId,
      summaryId: row.summaryId,
    });
    await runExtractEntitiesAndRelationsForSummary(db, {
      orgId: row.orgId,
      brandId: row.brandId,
      summaryId: row.summaryId,
    });
  }

  return result;
}

export { runMemoryConsolidation, runMemoryDecaySweep };
