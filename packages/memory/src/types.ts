import type { MemoryChunkEmbedder, SearchMemoryChunksResult } from "@keenai/memory-tree";
import type { QueryMemoryFactsResult } from "@keenai/memory-tree";
import type { KeenaiDb, VectorStore } from "@keenai/storage";
import type { FTSStore } from "@keenai/storage";
import type { MemorySummaryFtsStore } from "@keenai/storage";

export type KeenaiMemoryDeps = {
  db: KeenaiDb;
  chunkFts?: Pick<FTSStore, "search"> | null;
  chunkVector?: Pick<VectorStore, "query"> | null;
  queryEmbedder?: Pick<MemoryChunkEmbedder, "embed"> | null;
  summaryFts?: Pick<MemorySummaryFtsStore, "search"> | null;
};

export type MemoryStoreInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  predicate: string;
  object: unknown;
  confidence?: number;
  importance?: number;
  source?: string;
};

export type MemoryStoreResult = {
  factId: string;
  slotCount: number;
};

export type MemoryRecallInput = {
  orgId: string;
  brandId: string;
  q: string;
  scope?: "all" | "conversation" | "customer" | "channel";
  limit?: number;
};

export type MemoryRecallResult = SearchMemoryChunksResult;

export type MemoryGetInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  predicate?: string;
  limit?: number;
};

export type MemoryGetResult = QueryMemoryFactsResult;

export type MemoryForgetInput = {
  orgId: string;
  brandId: string;
  scope: string;
  scopeId: string;
  predicate?: string;
  factId?: string;
  reason?: string;
};

export type MemoryForgetResult = {
  forgotten: number;
};

export type KeenaiMemory = {
  store(input: MemoryStoreInput): Promise<MemoryStoreResult>;
  recall(input: MemoryRecallInput): Promise<MemoryRecallResult>;
  get(input: MemoryGetInput): Promise<MemoryGetResult>;
  forget(input: MemoryForgetInput): Promise<MemoryForgetResult>;
};
