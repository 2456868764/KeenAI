import { type KbIngestPayload, runKbIngestPipeline } from "@keenai/kb/inngest";
import type { KeenaiDb } from "@keenai/storage";

/** API wiring for KB-16 ingest pipeline (stub steps; extend per source). */
export async function runKbIngestForSource(_db: KeenaiDb, payload: KbIngestPayload) {
  return runKbIngestPipeline(payload);
}
