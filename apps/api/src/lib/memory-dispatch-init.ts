import type { Inngest } from "inngest";
import { Inngest as InngestClient } from "inngest";
import type { AppContext } from "../types.js";
import {
  type MemoryCanonicalizePayload,
  type MemoryDispatchAdapter,
  type MemoryExtractEntitiesPayload,
  type MemoryExtractFactsPayload,
  createInngestMemoryDispatch,
  createSyncMemoryDispatch,
} from "./memory-dispatch.js";
import {
  runExtractEntitiesAndRelationsForSummary,
  runExtractFactsForSummary,
  runProcessAdmittedChunk,
} from "./memory-pipeline.js";
import { ingestMemoryTreeForMessage } from "./memory-tree-ingest.js";

let adapter: MemoryDispatchAdapter | null = null;
let inngestClient: Inngest | null = null;

export function initMemoryDispatch(ctx: AppContext): MemoryDispatchAdapter {
  const handlers = {
    canonicalizeMessage: async (payload: MemoryCanonicalizePayload) => {
      const result = await ingestMemoryTreeForMessage(ctx.store.db, {
        orgId: payload.orgId,
        brandId: payload.brandId,
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        senderType: payload.senderType,
        plainText: payload.plainText,
        isInternal: payload.isInternal,
        createdAt: new Date(payload.sentAt),
        channelType: payload.channelType,
        channelId: payload.channelId,
      });
      return { chunkId: result.id };
    },
    extractChunk: async (payload: { orgId: string; brandId: string; chunkId: string }) => {
      const result = await runProcessAdmittedChunk(ctx.store.db, payload);
      for (const summaryId of result.summaryIds) {
        await runExtractFactsForSummary(ctx.store.db, {
          orgId: payload.orgId,
          brandId: payload.brandId,
          summaryId,
        });
        await runExtractEntitiesAndRelationsForSummary(ctx.store.db, {
          orgId: payload.orgId,
          brandId: payload.brandId,
          summaryId,
        });
      }
      return { processed: result.extracted };
    },
    extractFacts: async (payload: MemoryExtractFactsPayload) => {
      const result = await runExtractFactsForSummary(ctx.store.db, payload);
      return { extracted: result.extracted };
    },
    extractEntities: async (payload: MemoryExtractEntitiesPayload) => {
      const result = await runExtractEntitiesAndRelationsForSummary(ctx.store.db, payload);
      return { extracted: result.entityResult.extracted || result.relationResult.extracted };
    },
  };

  if (ctx.env.INNGEST_EVENT_KEY) {
    const client = new InngestClient({ id: ctx.env.INNGEST_APP_ID });
    inngestClient = client;
    adapter = createInngestMemoryDispatch(async (payload) => {
      await client.send(payload);
    });
    return adapter;
  }

  adapter = createSyncMemoryDispatch(handlers);
  return adapter;
}

export function getMemoryDispatch(): MemoryDispatchAdapter {
  if (!adapter) throw new Error("memory dispatch not initialized");
  return adapter;
}

export function getMemoryInngestClient(): Inngest | null {
  return inngestClient;
}
