export const MEMORY_INNGEST_EVENTS = {
  EXTRACT_CHUNK: "keenai/memory.extract_chunk",
  DIGEST_DAILY: "keenai/memory.digest_daily",
} as const;

export type MemoryExtractChunkPayload = {
  orgId: string;
  brandId: string;
  chunkId: string;
};

export type MemoryDispatchAdapter = {
  mode: "sync" | "inngest";
  enqueueExtractChunk: (payload: MemoryExtractChunkPayload) => Promise<void>;
};

export type MemoryDispatchHandlers = {
  extractChunk: (payload: MemoryExtractChunkPayload) => Promise<{ processed: boolean }>;
};

export function createSyncMemoryDispatch(handlers: MemoryDispatchHandlers): MemoryDispatchAdapter {
  return {
    mode: "sync",
    enqueueExtractChunk: async (payload) => {
      await handlers.extractChunk(payload);
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
  };
}
