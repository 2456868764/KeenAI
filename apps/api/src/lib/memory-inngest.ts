import { runDigestDaily } from "@keenai/memory-tree";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { MEMORY_INNGEST_EVENTS } from "./memory-dispatch.js";
import {
  runExtractEntitiesForSummary,
  runExtractFactsForSummary,
  runFlushStaleBuffers,
  runProcessAdmittedChunk,
} from "./memory-pipeline.js";
import { getMemorySummaryFtsIndexer } from "./memory-summary-fts-init.js";

export const MEMORY_DIGEST_CRON_DEFAULT = "0 0 * * *";
export const MEMORY_FLUSH_STALE_CRON_DEFAULT = "0 * * * *";

export function createMemoryInngestFunctions(client: Inngest, ctx: AppContext) {
  const extract = client.createFunction(
    { id: "keenai-memory-extract-chunk" },
    { event: MEMORY_INNGEST_EVENTS.EXTRACT_CHUNK },
    async ({ event, step }) => {
      const data = event.data as {
        orgId: string;
        brandId: string;
        chunkId: string;
      };

      const result = await step.run("process-admitted-chunk", () =>
        runProcessAdmittedChunk(ctx.store.db, data),
      );

      for (const summaryId of result.summaryIds) {
        await step.sendEvent(`extract-facts-${summaryId}`, {
          name: MEMORY_INNGEST_EVENTS.EXTRACT_FACTS,
          data: { orgId: data.orgId, brandId: data.brandId, summaryId },
        });
        await step.sendEvent(`extract-entities-${summaryId}`, {
          name: MEMORY_INNGEST_EVENTS.EXTRACT_ENTITIES,
          data: { orgId: data.orgId, brandId: data.brandId, summaryId },
        });
      }

      return result;
    },
  );

  const extractFacts = client.createFunction(
    { id: "keenai-memory-extract-facts" },
    { event: MEMORY_INNGEST_EVENTS.EXTRACT_FACTS },
    async ({ event }) => {
      const data = event.data as {
        orgId: string;
        brandId: string;
        summaryId: string;
      };
      return runExtractFactsForSummary(ctx.store.db, data);
    },
  );

  const extractEntities = client.createFunction(
    { id: "keenai-memory-extract-entities" },
    { event: MEMORY_INNGEST_EVENTS.EXTRACT_ENTITIES },
    async ({ event }) => {
      const data = event.data as {
        orgId: string;
        brandId: string;
        summaryId: string;
      };
      return runExtractEntitiesForSummary(ctx.store.db, data);
    },
  );

  const digestDaily = client.createFunction(
    { id: "keenai-memory-digest-daily" },
    { event: MEMORY_INNGEST_EVENTS.DIGEST_DAILY },
    async ({ event }) => {
      const data = (event.data ?? {}) as {
        dateUtc?: string;
        orgId?: string;
        brandId?: string;
      };
      return runDigestDaily(ctx.store.db, {
        ...data,
        summaryFtsIndexer: getMemorySummaryFtsIndexer(),
      });
    },
  );

  const digestDailyCron = client.createFunction(
    { id: "keenai-memory-digest-daily-cron" },
    { cron: ctx.env.INNGEST_MEMORY_DIGEST_CRON },
    async () => runDigestDaily(ctx.store.db, { summaryFtsIndexer: getMemorySummaryFtsIndexer() }),
  );

  const flushStaleCron = client.createFunction(
    { id: "keenai-memory-flush-stale-cron" },
    { cron: ctx.env.INNGEST_MEMORY_FLUSH_STALE_CRON },
    async () => runFlushStaleBuffers(ctx.store.db),
  );

  return [
    extract,
    extractFacts,
    extractEntities,
    digestDaily,
    digestDailyCron,
    flushStaleCron,
  ] as const;
}
