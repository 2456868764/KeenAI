import {
  MEMORY_CONSOLIDATE_CRON_DEFAULT,
  MEMORY_DECAY_CRON_DEFAULT,
  MEMORY_DIGEST_CRON_DEFAULT,
  MEMORY_FLUSH_STALE_CRON_DEFAULT,
  MEMORY_INNGEST_EVENTS,
  type MemoryConsolidationPayload,
  type MemoryDecaySweepPayload,
  type MemoryDigestDailyPayload,
  type MemoryExtractChunkPayload,
  type MemoryExtractEntitiesPayload,
  type MemoryExtractFactsPayload,
  type MemoryInngestClient,
  type MemoryInngestFunction,
  type MemoryInngestHandlers,
  type MemoryInngestOptions,
} from "./types.js";

export {
  MEMORY_CONSOLIDATE_CRON_DEFAULT,
  MEMORY_DECAY_CRON_DEFAULT,
  MEMORY_DIGEST_CRON_DEFAULT,
  MEMORY_FLUSH_STALE_CRON_DEFAULT,
  MEMORY_INNGEST_EVENTS,
} from "./types.js";
export type {
  MemoryConsolidationPayload,
  MemoryDecaySweepPayload,
  MemoryDigestDailyPayload,
  MemoryExtractChunkPayload,
  MemoryExtractEntitiesPayload,
  MemoryExtractFactsPayload,
  MemoryInngestClient,
  MemoryInngestFunction,
  MemoryInngestHandlers,
  MemoryInngestOptions,
  ProcessAdmittedChunkResult,
} from "./types.js";

/** Register KeenAI memory Inngest functions (extract pipeline + consolidation crons). */
export function createMemoryInngestFunctions<TFn extends MemoryInngestFunction>(
  client: MemoryInngestClient<TFn>,
  handlers: MemoryInngestHandlers,
  opts: MemoryInngestOptions = {},
): readonly TFn[] {
  const digestCronSchedule = opts.digestCron ?? MEMORY_DIGEST_CRON_DEFAULT;
  const flushStaleCronSchedule = opts.flushStaleCron ?? MEMORY_FLUSH_STALE_CRON_DEFAULT;
  const consolidateCronSchedule = opts.consolidateCron ?? MEMORY_CONSOLIDATE_CRON_DEFAULT;
  const decayCronSchedule = opts.decayCron ?? MEMORY_DECAY_CRON_DEFAULT;

  const extract = client.createFunction(
    { id: "keenai-memory-extract-chunk" },
    { event: MEMORY_INNGEST_EVENTS.EXTRACT_CHUNK },
    async ({ event, step }) => {
      const data = event.data as MemoryExtractChunkPayload;
      const result = await step.run("process-admitted-chunk", () =>
        handlers.processAdmittedChunk(data),
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
    async ({ event }) => handlers.extractFacts(event.data as MemoryExtractFactsPayload),
  );

  const extractEntities = client.createFunction(
    { id: "keenai-memory-extract-entities" },
    { event: MEMORY_INNGEST_EVENTS.EXTRACT_ENTITIES },
    async ({ event }) => handlers.extractEntities(event.data as MemoryExtractEntitiesPayload),
  );

  const digestDaily = client.createFunction(
    { id: "keenai-memory-digest-daily" },
    { event: MEMORY_INNGEST_EVENTS.DIGEST_DAILY },
    async ({ event }) =>
      handlers.digestDaily((event.data ?? {}) as MemoryDigestDailyPayload | undefined),
  );

  const digestDailyCron = client.createFunction(
    { id: "keenai-memory-digest-daily-cron" },
    { cron: digestCronSchedule },
    async () => handlers.digestDaily(),
  );

  const flushStaleCron = client.createFunction(
    { id: "keenai-memory-flush-stale-cron" },
    { cron: flushStaleCronSchedule },
    async () => handlers.flushStaleBuffers(),
  );

  const consolidate = client.createFunction(
    { id: "keenai-memory-consolidate" },
    { event: MEMORY_INNGEST_EVENTS.CONSOLIDATE },
    async ({ event }) =>
      handlers.consolidate((event.data ?? {}) as MemoryConsolidationPayload | undefined),
  );

  const consolidateCron = client.createFunction(
    { id: "keenai-memory-consolidate-cron" },
    { cron: consolidateCronSchedule },
    async () => handlers.consolidate(),
  );

  const decaySweep = client.createFunction(
    { id: "keenai-memory-decay-sweep" },
    { event: MEMORY_INNGEST_EVENTS.DECAY_SWEEP },
    async ({ event }) =>
      handlers.decaySweep((event.data ?? {}) as MemoryDecaySweepPayload | undefined),
  );

  const decaySweepCron = client.createFunction(
    { id: "keenai-memory-decay-sweep-cron" },
    { cron: decayCronSchedule },
    async () => handlers.decaySweep(),
  );

  return [
    extract,
    extractFacts,
    extractEntities,
    digestDaily,
    digestDailyCron,
    flushStaleCron,
    consolidate,
    consolidateCron,
    decaySweep,
    decaySweepCron,
  ];
}
