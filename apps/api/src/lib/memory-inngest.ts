import {
  MEMORY_CONSOLIDATE_CRON_DEFAULT,
  MEMORY_DECAY_CRON_DEFAULT,
  MEMORY_DIGEST_CRON_DEFAULT,
  MEMORY_FLUSH_STALE_CRON_DEFAULT,
  createMemoryInngestFunctions as createPackageMemoryInngestFunctions,
} from "@keenai/memory/inngest";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import {
  runDigestDailyPipeline,
  runExtractEntitiesAndRelationsForSummary,
  runExtractFactsForSummary,
  runFlushStaleBuffers,
  runMemoryConsolidation,
  runMemoryDecaySweep,
  runProcessAdmittedChunk,
} from "./memory-pipeline.js";
import { ingestMemoryTreeForMessage } from "./memory-tree-ingest.js";

export {
  MEMORY_CONSOLIDATE_CRON_DEFAULT,
  MEMORY_DECAY_CRON_DEFAULT,
  MEMORY_DIGEST_CRON_DEFAULT,
  MEMORY_FLUSH_STALE_CRON_DEFAULT,
};

export function createMemoryInngestFunctions(client: Inngest, ctx: AppContext) {
  return createPackageMemoryInngestFunctions(
    client,
    {
      canonicalizeMessage: (payload) =>
        ingestMemoryTreeForMessage(ctx.store.db, {
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
        }),
      processAdmittedChunk: (payload) => runProcessAdmittedChunk(ctx.store.db, payload),
      extractFacts: (payload) => runExtractFactsForSummary(ctx.store.db, payload),
      extractEntities: (payload) => runExtractEntitiesAndRelationsForSummary(ctx.store.db, payload),
      digestDaily: (payload) => runDigestDailyPipeline(ctx.store.db, payload),
      flushStaleBuffers: () => runFlushStaleBuffers(ctx.store.db),
      consolidate: (payload) => runMemoryConsolidation(ctx.store.db, payload),
      decaySweep: (payload) => runMemoryDecaySweep(ctx.store.db, payload),
    },
    {
      digestCron: ctx.env.INNGEST_MEMORY_DIGEST_CRON,
      flushStaleCron: ctx.env.INNGEST_MEMORY_FLUSH_STALE_CRON,
      consolidateCron: ctx.env.INNGEST_MEMORY_CONSOLIDATE_CRON,
      decayCron: ctx.env.INNGEST_MEMORY_DECAY_CRON,
    },
  );
}
