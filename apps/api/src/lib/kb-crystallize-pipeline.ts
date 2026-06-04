import {
  type KbCrystallizePayload,
  rankKbCrystallizeCandidates,
  runKbCrystallization,
} from "@keenai/kb";
import type { KeenaiDb } from "@keenai/storage";

export async function runKbCrystallizeJob(db: KeenaiDb, payload: KbCrystallizePayload) {
  return runKbCrystallization(db, payload);
}

export async function rankKbCrystallizeQueue(
  db: KeenaiDb,
  input: Parameters<typeof rankKbCrystallizeCandidates>[1],
) {
  return rankKbCrystallizeCandidates(db, input);
}
