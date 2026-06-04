import {
  KB_INGEST_STEPS,
  type KbIngestPayload,
  type KbIngestPipelineResult,
  type KbIngestStepResult,
} from "./types.js";

export const KEENI_KB_KB16 = {
  enabled: true,
  target: "kb.ingest.inngest",
  notes: "KB-16 stub: fetch→parse→clean→chunk→enrich→embed→index→notify.",
} as const;

/** KB-16 pipeline stub — each step succeeds; worker wires real handlers later. */
export async function runKbIngestPipeline(
  payload: KbIngestPayload,
): Promise<KbIngestPipelineResult> {
  const steps: KbIngestStepResult[] = KB_INGEST_STEPS.map((step) => ({
    step,
    ok: true,
    detail: `stub:${payload.sourceId}`,
  }));

  return {
    sourceId: payload.sourceId,
    documentId: payload.documentId,
    steps,
  };
}
