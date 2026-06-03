import { runDigestDaily } from "@keenai/memory-tree";
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
  runExtractEntitiesAndRelationsForSummary,
  runExtractFactsForSummary,
  runFlushStaleBuffers,
  runMemoryConsolidation,
  runMemoryDecaySweep,
  runProcessAdmittedChunk,
} from "./memory-pipeline.js";
import { getMemorySummaryFtsIndexer } from "./memory-summary-fts-init.js";

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
      processAdmittedChunk: (payload) => runProcessAdmittedChunk(ctx.store.db, payload),
      extractFacts: (payload) => runExtractFactsForSummary(ctx.store.db, payload),
      extractEntities: (payload) => runExtractEntitiesAndRelationsForSummary(ctx.store.db, payload),
      digestDaily: (payload) =>
        runDigestDaily(ctx.store.db, {
          ...payload,
          summaryFtsIndexer: getMemorySummaryFtsIndexer(),
        }),
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
