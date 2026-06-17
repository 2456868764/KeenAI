import { homedir } from "node:os";
import { join } from "node:path";
import { LibSQLStore, LibSQLVector } from "@mastra/libsql";

export type KeenaiMastraStorageBundle = {
  storage: LibSQLStore;
  vector?: LibSQLVector;
  storageUrl: string;
};

export type BuildKeeniMastraStorageInput = {
  orgId: string;
  brandId: string;
  storageUrl?: string;
  databaseUrl?: string;
  withVector?: boolean;
};

/** Resolve LibSQL URL for Mastra Memory (shared app DB by default). */
export function resolveKeeniMemoryStorageUrl(input?: {
  storageUrl?: string;
  databaseUrl?: string;
}): string {
  const explicit = input?.storageUrl?.trim() || input?.databaseUrl?.trim();
  if (explicit) return explicit;

  const fromEnv = process.env.KEENAI_MASTRA_MEMORY_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "test") return ":memory:";

  return `file:${join(homedir(), ".keenai", "mastra-memory.db")}`;
}

/** Brand-scoped Mastra LibSQL storage + optional vector index on the same URL. */
export function buildKeeniMastraStorage(
  input: BuildKeeniMastraStorageInput,
): KeenaiMastraStorageBundle {
  const storageUrl = resolveKeeniMemoryStorageUrl(input);
  const storageId = `keeni-memory-${input.orgId}-${input.brandId}`;
  const storage = new LibSQLStore({ id: storageId, url: storageUrl });

  if (input.withVector === false) {
    return { storage, storageUrl };
  }

  return {
    storage,
    vector: new LibSQLVector({ id: `${storageId}-vector`, url: storageUrl }),
    storageUrl,
  };
}
