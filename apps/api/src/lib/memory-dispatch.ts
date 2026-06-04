import {
  type MemoryCanonicalizePayload,
  MEMORY_INNGEST_EVENTS as PACKAGE_MEMORY_INNGEST_EVENTS,
} from "@keenai/memory/inngest";

export const MEMORY_INNGEST_EVENTS = PACKAGE_MEMORY_INNGEST_EVENTS;

export type { MemoryCanonicalizePayload };

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

export type MemoryDispatchAdapter = {
  mode: "sync" | "inngest";
  enqueueCanonicalize: (payload: MemoryCanonicalizePayload) => Promise<void>;
  enqueueExtractChunk: (payload: MemoryExtractChunkPayload) => Promise<void>;
  enqueueExtractFacts: (payload: MemoryExtractFactsPayload) => Promise<void>;
  enqueueExtractEntities: (payload: MemoryExtractEntitiesPayload) => Promise<void>;
};

export type MemoryDispatchHandlers = {
  canonicalizeMessage: (payload: MemoryCanonicalizePayload) => Promise<{ chunkId: string }>;
  extractChunk: (payload: MemoryExtractChunkPayload) => Promise<{ processed: boolean }>;
  extractFacts: (payload: MemoryExtractFactsPayload) => Promise<{ extracted: boolean }>;
  extractEntities: (payload: MemoryExtractEntitiesPayload) => Promise<{ extracted: boolean }>;
};

export function createSyncMemoryDispatch(handlers: MemoryDispatchHandlers): MemoryDispatchAdapter {
  return {
    mode: "sync",
    enqueueCanonicalize: async (payload) => {
      await handlers.canonicalizeMessage(payload);
    },
    enqueueExtractChunk: async (payload) => {
      await handlers.extractChunk(payload);
    },
    enqueueExtractFacts: async (payload) => {
      await handlers.extractFacts(payload);
    },
    enqueueExtractEntities: async (payload) => {
      await handlers.extractEntities(payload);
    },
  };
}

export function createInngestMemoryDispatch(
  send: (payload: { name: string; data: Record<string, unknown> }) => Promise<void>,
): MemoryDispatchAdapter {
  return {
    mode: "inngest",
    enqueueCanonicalize: async (payload) => {
      await send({ name: MEMORY_INNGEST_EVENTS.CANONICALIZE, data: payload });
    },
    enqueueExtractChunk: async (payload) => {
      await send({ name: MEMORY_INNGEST_EVENTS.EXTRACT_CHUNK, data: payload });
    },
    enqueueExtractFacts: async (payload) => {
      await send({ name: MEMORY_INNGEST_EVENTS.EXTRACT_FACTS, data: payload });
    },
    enqueueExtractEntities: async (payload) => {
      await send({ name: MEMORY_INNGEST_EVENTS.EXTRACT_ENTITIES, data: payload });
    },
  };
}
