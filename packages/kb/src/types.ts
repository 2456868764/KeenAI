import type { KeenaiDb } from "@keenai/storage";
import type { KbDocumentStatus } from "@keenai/storage/schema";
import type { SyncKbSourceInput, SyncKbSourceResult } from "./connectors/types.js";

export type KeenaiKbDeps = {
  db: KeenaiDb;
};

export type ListKbDocumentsInput = {
  orgId: string;
  brandId: string;
  status?: KbDocumentStatus;
  limit?: number;
};

export type KbDocumentView = {
  id: string;
  sourceId: string;
  title: string;
  url: string | null;
  status: KbDocumentStatus;
  canonicalLocale: string | null;
  version: number;
  indexedAt: Date | null;
  updatedAt: Date;
};

export type KeenaiKb = {
  listDocuments(input: ListKbDocumentsInput): Promise<KbDocumentView[]>;
  syncSource(input: SyncKbSourceInput): Promise<SyncKbSourceResult>;
};

export type { SyncKbSourceInput, SyncKbSourceResult };
