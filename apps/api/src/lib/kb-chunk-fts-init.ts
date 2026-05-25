import type { FTSStore, LibsqlStore, Store } from "@keenai/storage";
import { createLibsqlKbChunkFtsStore } from "@keenai/storage";

let chunkFtsStore: FTSStore | null = null;

/** Bootstrap KB chunk FTS indexing from a LibSQL store. */
export function initKbChunkFtsFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  chunkFtsStore = createLibsqlKbChunkFtsStore((store as LibsqlStore).client);
}

export function getKbChunkFtsStore(): FTSStore | null {
  return chunkFtsStore;
}
