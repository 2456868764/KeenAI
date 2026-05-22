export const MEMORY_INNGEST_EVENTS = {
  EXTRACT_CHUNK: "keenai/memory.extract_chunk",
  EXTRACT_FACTS: "keenai/memory.extract_facts",
  DIGEST_DAILY: "keenai/memory.digest_daily",
} as const;

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

export type MemoryDispatchAdapter = {
  mode: "sync" | "inngest";
  enqueueExtractChunk: (payload: MemoryExtractChunkPayload) => Promise<void>;
  enqueueExtractFacts: (payload: MemoryExtractFactsPayload) => Promise<void>;
};

export type MemoryDispatchHandlers = {
  extractChunk: (payload: MemoryExtractChunkPayload) => Promise<{ processed: boolean }>;
  extractFacts: (payload: MemoryExtractFactsPayload) => Promise<{ extracted: boolean }>;
};

export function createSyncMemoryDispatch(handlers: MemoryDispatchHandlers): MemoryDispatchAdapter {
  return {
    mode: "sync",
    enqueueExtractChunk: async (payload) => {
      await handlers.extractChunk(payload);
    },
    enqueueExtractFacts: async (payload) => {
      await handlers.extractFacts(payload);
    },
  };
}

export function createInngestMemoryDispatch(
  send: (payload: { name: string; data: Record<string, unknown> }) => Promise<void>,
): MemoryDispatchAdapter {
  return {
    mode: "inngest",
    enqueueExtractChunk: async (payload) => {
      await send({ name: MEMORY_INNGEST_EVENTS.EXTRACT_CHUNK, data: payload });
    },
    enqueueExtractFacts: async (payload) => {
      await send({ name: MEMORY_INNGEST_EVENTS.EXTRACT_FACTS, data: payload });
    },
  };
}
