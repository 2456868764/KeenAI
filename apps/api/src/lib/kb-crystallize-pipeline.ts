import {
  type KbCrystallizePayload,
  createKeenaiKb,
  rankKbCrystallizeCandidates,
  runKbCrystallization,
} from "@keenai/kb";
import type { KeenaiDb } from "@keenai/storage";
import { getKbChunkFtsStore } from "./kb-chunk-fts-init.js";

export async function runKbCrystallizeJob(db: KeenaiDb, payload: KbCrystallizePayload) {
  const result = await runKbCrystallization(db, payload);
  if (result.gate === "auto_index" && result.documentId) {
    const chunkFts = getKbChunkFtsStore();
    if (chunkFts) {
      const kb = createKeenaiKb({ db });
      await kb.indexDocument({
        orgId: payload.orgId,
        brandId: payload.brandId,
        documentId: result.documentId,
        chunkFtsIndexer: chunkFts,
      });
    }
  }
  return result;
}

export async function rankKbCrystallizeQueue(
  db: KeenaiDb,
  input: Parameters<typeof rankKbCrystallizeCandidates>[1],
) {
  return rankKbCrystallizeCandidates(db, input);
}
