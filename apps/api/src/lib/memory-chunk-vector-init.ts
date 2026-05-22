import type { LibsqlStore, Store, VectorStore } from "@keenai/storage";
import { createLibsqlMemoryChunkVectorStore } from "@keenai/storage";

let chunkVectorStore: VectorStore | null = null;

/** Bootstrap memory chunk vector store from a LibSQL store. */
export function initMemoryChunkVectorFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  chunkVectorStore = createLibsqlMemoryChunkVectorStore((store as LibsqlStore).client);
}

export function getMemoryChunkVectorStore(): VectorStore | null {
  return chunkVectorStore;
}
