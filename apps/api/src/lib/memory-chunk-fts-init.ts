import type { MemoryChunkFtsIndexer } from "@keenai/memory-tree";
import {
  type FTSStore,
  type LibsqlStore,
  type Store,
  createLibsqlMemoryChunkFtsStore,
} from "@keenai/storage";

let chunkFtsStore: FTSStore | null = null;

/** Bootstrap memory chunk FTS indexing from a LibSQL store. */
export function initMemoryChunkFtsFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  chunkFtsStore = createLibsqlMemoryChunkFtsStore((store as LibsqlStore).client);
}

export function getMemoryChunkFtsStore(): FTSStore | null {
  return chunkFtsStore;
}

export function getMemoryChunkFtsIndexer(): MemoryChunkFtsIndexer | null {
  return chunkFtsStore;
}
