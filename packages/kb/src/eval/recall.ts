/** Retrieval ranking metrics for golden eval (Sprint 18). */

export function recallAtK(expectedIds: string[], retrievedIds: string[], k: number): number {
  if (expectedIds.length === 0) return 1;
  const top = new Set(retrievedIds.slice(0, k));
  const hits = expectedIds.filter((id) => top.has(id)).length;
  return hits / expectedIds.length;
}

export function hitAtK(expectedIds: string[], retrievedIds: string[], k: number): boolean {
  if (expectedIds.length === 0) return true;
  const top = new Set(retrievedIds.slice(0, k));
  return expectedIds.some((id) => top.has(id));
}

export function reciprocalRank(expectedIds: string[], retrievedIds: string[]): number {
  if (expectedIds.length === 0) return 1;
  const expected = new Set(expectedIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    const id = retrievedIds[i];
    if (id && expected.has(id)) return 1 / (i + 1);
  }
  return 0;
}

export function averageRecallAtK(
  cases: Array<{ expectedIds: string[]; retrievedIds: string[] }>,
  k: number,
): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((acc, row) => acc + recallAtK(row.expectedIds, row.retrievedIds, k), 0);
  return sum / cases.length;
}

export function meanReciprocalRank(
  cases: Array<{ expectedIds: string[]; retrievedIds: string[] }>,
): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce(
    (acc, row) => acc + reciprocalRank(row.expectedIds, row.retrievedIds),
    0,
  );
  return sum / cases.length;
}

export function hitRate(
  cases: Array<{ expectedIds: string[]; retrievedIds: string[] }>,
  k: number,
): number {
  if (cases.length === 0) return 0;
  const hits = cases.filter((row) => hitAtK(row.expectedIds, row.retrievedIds, k)).length;
  return hits / cases.length;
}
