import {
  extractEntitiesFromSummary,
  extractFactsFromSummary,
  flushStaleBuffers,
  processAdmittedChunk,
} from "@keenai/memory-tree";
import type { KeenaiDb } from "@keenai/storage";
import { getMemoryEntityExtractor } from "./memory-entity-extract-init.js";
import { getMemoryFactExtractor } from "./memory-fact-extract-init.js";
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
  const extractor = getMemoryEntityExtractor();
  if (!extractor) {
    return {
      extracted: false,
      summaryId: payload.summaryId,
      scope: "",
      scopeId: "",
      entityCount: 0,
      reason: "extract_disabled",
    };
  }

  return extractEntitiesFromSummary(db, {
    ...payload,
    entityExtractor: extractor,
  });
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
    await runExtractEntitiesForSummary(db, {
      orgId: row.orgId,
      brandId: row.brandId,
      summaryId: row.summaryId,
    });
  }

  return result;
}
