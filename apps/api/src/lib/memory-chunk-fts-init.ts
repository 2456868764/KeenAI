import type { MemoryChunkFtsIndexer } from "@keenai/memory-tree";
import { type LibsqlStore, type Store, createLibsqlMemoryChunkFtsStore } from "@keenai/storage";

let indexer: MemoryChunkFtsIndexer | null = null;

/** Bootstrap memory chunk FTS indexing from a LibSQL store. */
export function initMemoryChunkFtsFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  indexer = createLibsqlMemoryChunkFtsStore((store as LibsqlStore).client);
}

export function getMemoryChunkFtsIndexer(): MemoryChunkFtsIndexer | null {
  return indexer;
}
