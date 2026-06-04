export const MEMORY_INNGEST_EVENTS = {
  CANONICALIZE: "keenai/memory.canonicalize",
  EXTRACT_CHUNK: "keenai/memory.extract_chunk",
  EXTRACT_FACTS: "keenai/memory.extract_facts",
  EXTRACT_ENTITIES: "keenai/memory.extract_entities",
  DIGEST_DAILY: "keenai/memory.digest_daily",
  FLUSH_STALE_BUFFERS: "keenai/memory.flush_stale_buffers",
  CONSOLIDATE: "keenai/memory.consolidate",
  DECAY_SWEEP: "keenai/memory.decay_sweep",
} as const;

export const MEMORY_DIGEST_CRON_DEFAULT = "0 0 * * *";
export const MEMORY_FLUSH_STALE_CRON_DEFAULT = "0 * * * *";
export const MEMORY_CONSOLIDATE_CRON_DEFAULT = "0 * * * *";
export const MEMORY_DECAY_CRON_DEFAULT = "0 3 * * *";

export type MemoryCanonicalizePayload = {
  orgId: string;
  brandId: string;
  conversationId: string;
  messageId: string;
  senderType: string;
  sentAt: string;
  plainText: string;
  isInternal: boolean;
  channelType?: string;
  channelId?: string;
};

export type MemoryExtractChunkPayload = {
  orgId: string;
  brandId: string;
  chunkId: string;
};

export type MemoryExtractFactsPayload = {
  orgId: string;
  brandId: string;
  summaryId: string;
};

export type MemoryExtractEntitiesPayload = {
  orgId: string;
  brandId: string;
  summaryId: string;
};

export type MemoryDigestDailyPayload = {
  dateUtc?: string;
  orgId?: string;
  brandId?: string;
};

export type MemoryConsolidationPayload = {
  orgId?: string;
  brandId?: string;
};

export type MemoryDecaySweepPayload = {
  orgId?: string;
  brandId?: string;
};

export type ProcessAdmittedChunkResult = {
  summaryIds: string[];
};

export type MemoryInngestHandlers = {
  canonicalizeMessage: (payload: MemoryCanonicalizePayload) => Promise<unknown>;
  processAdmittedChunk: (payload: MemoryExtractChunkPayload) => Promise<ProcessAdmittedChunkResult>;
  extractFacts: (payload: MemoryExtractFactsPayload) => Promise<unknown>;
  extractEntities: (payload: MemoryExtractEntitiesPayload) => Promise<unknown>;
  digestDaily: (payload?: MemoryDigestDailyPayload) => Promise<unknown>;
  flushStaleBuffers: () => Promise<unknown>;
  consolidate: (payload?: MemoryConsolidationPayload) => Promise<unknown>;
  decaySweep: (payload?: MemoryDecaySweepPayload) => Promise<unknown>;
};

export type MemoryInngestOptions = {
  digestCron?: string;
  flushStaleCron?: string;
  consolidateCron?: string;
  decayCron?: string;
};

export type MemoryInngestStep = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
  sendEvent: (
    id: string,
    event: { name: string; data: Record<string, unknown> },
  ) => Promise<unknown>;
};

export type MemoryInngestHandlerContext = {
  event: { data: unknown };
  step: MemoryInngestStep;
};

export type MemoryInngestTrigger = { event: string } | { cron: string };

export type MemoryInngestFunction = {
  id: () => string;
};

export type MemoryInngestClient<TFn extends MemoryInngestFunction = MemoryInngestFunction> = {
  createFunction: (
    metadata: { id: string },
    trigger: MemoryInngestTrigger,
    handler: (ctx: MemoryInngestHandlerContext) => Promise<unknown> | unknown,
  ) => TFn;
};
