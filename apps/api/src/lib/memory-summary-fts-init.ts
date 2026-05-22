import type { MemorySummaryFtsIndexer } from "@keenai/memory-tree";
import {
  type LibsqlStore,
  type MemorySummaryFtsStore,
  type Store,
  createLibsqlMemorySummaryFtsStore,
} from "@keenai/storage";

let summaryFtsStore: MemorySummaryFtsStore | null = null;

/** Bootstrap memory summary FTS indexing from a LibSQL store. */
export function initMemorySummaryFtsFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  summaryFtsStore = createLibsqlMemorySummaryFtsStore((store as LibsqlStore).client);
}

export function getMemorySummaryFtsStore(): MemorySummaryFtsStore | null {
  return summaryFtsStore;
}

export function getMemorySummaryFtsIndexer(): MemorySummaryFtsIndexer | null {
  return summaryFtsStore;
}
