import { extractFactsFromSummary, processAdmittedChunk } from "@keenai/memory-tree";
import type { KeenaiDb } from "@keenai/storage";
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
