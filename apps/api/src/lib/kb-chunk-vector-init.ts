import type { LibsqlStore, Store, VectorStore } from "@keenai/storage";
import { createLibsqlKbChunkVectorStore } from "@keenai/storage";

let chunkVectorStore: VectorStore | null = null;

/** Bootstrap KB chunk vector search from a LibSQL store. */
export function initKbChunkVectorFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  chunkVectorStore = createLibsqlKbChunkVectorStore((store as LibsqlStore).client);
}

export function getKbChunkVectorStore(): VectorStore | null {
  return chunkVectorStore;
}
