import {
  KB_INGEST_STEPS,
  KB_INNGEST_EVENTS,
  type KbCrystallizePayload,
  type KbIngestPayload,
  type KbInngestClient,
  type KbInngestHandlers,
} from "./types.js";

export { KB_INGEST_STEPS, KB_INNGEST_EVENTS };
export type {
  KbCrystallizePayload,
  KbIngestPayload,
  KbIngestPipelineResult,
  KbIngestStepResult,
} from "./types.js";
export { runKbIngestPipeline, KEENI_KB_KB16 } from "./kb-ingest-pipeline.js";

/** KB-16: 8-step ingestion orchestration via Inngest (brand-level concurrency). */
export function createKbInngestFunctions(
  client: KbInngestClient,
  handlers: KbInngestHandlers,
): readonly object[] {
  const functions: object[] = [];

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

  functions.push(ingest as object);

  const crystallize = client.createFunction(
    { id: "keenai-kb-crystallize", concurrency: { limit: 2, key: "event.data.brandId" } },
    { event: KB_INNGEST_EVENTS.CRYSTALLIZE },
    async ({ event, step }) => {
      const data = event.data as KbCrystallizePayload;
      return step.run("kb-crystallize", () => handlers.runCrystallize(data));
    },
  );
  functions.push(crystallize as object);

  const onConversationClosed = client.createFunction(
    { id: "keenai-kb-crystallize-on-close" },
    { event: KB_INNGEST_EVENTS.CONVERSATION_CLOSED },
    async ({ event, step }) => {
      const data = event.data as KbCrystallizePayload;
      if (data.csatScore < 4) return { skipped: true, reason: "csat_below_threshold" };
      return step.run("kb-crystallize-on-close", () => handlers.runCrystallize(data));
    },
  );
  functions.push(onConversationClosed as object);

  return functions;
}
