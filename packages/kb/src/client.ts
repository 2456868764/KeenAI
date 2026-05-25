import { listKbDocuments } from "./list-documents.js";
import type { KeenaiKb, KeenaiKbDeps } from "./types.js";

/** Create the KeenAI knowledge base facade (documents first; chunks/search in later KB-*). */
export function createKeenaiKb(deps: KeenaiKbDeps): KeenaiKb {
  return {
    listDocuments: (input) => listKbDocuments(deps.db, input),
  };
}
