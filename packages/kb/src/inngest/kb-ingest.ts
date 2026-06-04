import {
  KB_INGEST_STEPS,
  KB_INNGEST_EVENTS,
  type KbIngestPayload,
  type KbInngestClient,
  type KbInngestHandlers,
} from "./types.js";

export { KB_INGEST_STEPS, KB_INNGEST_EVENTS };
export type { KbIngestPayload, KbIngestPipelineResult, KbIngestStepResult } from "./types.js";
export { runKbIngestPipeline, KEENI_KB_KB16 } from "./kb-ingest-pipeline.js";

/** KB-16: 8-step ingestion orchestration via Inngest (brand-level concurrency). */
export function createKbInngestFunctions(
  client: KbInngestClient,
  handlers: KbInngestHandlers,
): readonly object[] {
  const ingest = client.createFunction(
    {
      id: "keenai-kb-ingest",
      concurrency: { limit: 1, key: "event.data.brandId" },
    },
    { event: KB_INNGEST_EVENTS.INGEST },
    async ({ event, step }) => {
      const data = event.data as KbIngestPayload;
      return step.run("kb-ingest-pipeline", () => handlers.runIngest(data));
    },
  );

  return [ingest as object];
}
