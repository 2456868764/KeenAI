import type { SyncKbSourceInput, SyncKbSourceResult } from "./connectors/types.js";
import { listKbDocuments } from "./list-documents.js";
import { syncKbSource } from "./sync-source.js";
import type { KeenaiKb, KeenaiKbDeps } from "./types.js";

/** Create the KeenAI knowledge base facade (documents first; chunks/search in later KB-*). */
export function createKeenaiKb(deps: KeenaiKbDeps): KeenaiKb {
  return {
    listDocuments: (input) => listKbDocuments(deps.db, input),
    syncSource: (input: SyncKbSourceInput): Promise<SyncKbSourceResult> =>
      syncKbSource(deps.db, input),
  };
}
