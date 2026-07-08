import {
  KB_INGEST_STEPS,
  type KbIngestPayload,
  type KbIngestPipelineResult,
  type KbIngestStep,
  type KbIngestStepResult,
} from "./types.js";

export const KEENI_KB_KB16 = {
  enabled: true,
  target: "kb.ingest.inngest",
  notes: "KB-16: fetch→parse→clean→chunk→enrich→embed→index→notify with per-step results.",
} as const;

export type KbIngestPipelineState = {
  payload: KbIngestPayload;
  artifacts: Record<string, unknown>;
  failedStep?: KbIngestStep;
};

export type KbIngestStepHandler = (
  state: KbIngestPipelineState,
) => Promise<{ detail?: string; metadata?: Record<string, unknown> } | undefined>;

export type KbIngestPipelineHandlers = Partial<Record<KbIngestStep, KbIngestStepHandler>>;

export type KbIngestPipelineOptions = {
  handlers?: KbIngestPipelineHandlers;
  now?: () => number;
};

const DEFAULT_STEP_HANDLERS: Record<KbIngestStep, KbIngestStepHandler> = {
  async fetch(state) {
    state.artifacts.fetched = {
      sourceId: state.payload.sourceId,
      documentId: state.payload.documentId ?? null,
    };
    return {
      detail: state.payload.documentId
        ? `document:${state.payload.documentId}`
        : `source:${state.payload.sourceId}`,
    };
  },
  async parse(state) {
    state.artifacts.parsed = true;
    return { detail: "parsed" };
  },
  async clean(state) {
    state.artifacts.cleaned = true;
    return { detail: "cleaned" };
  },
  async chunk(state) {
    state.artifacts.chunked = true;
    return { detail: "chunked" };
  },
  async enrich(state) {
    state.artifacts.enriched = true;
    return { detail: "enriched" };
  },
  async embed(state) {
    state.artifacts.embedded = true;
    return { detail: "embedded" };
  },
  async index(state) {
    state.artifacts.indexed = true;
    return { detail: "indexed" };
  },
  async notify(state) {
    return {
      detail: state.failedStep ? `failed:${state.failedStep}` : "completed",
      metadata: { artifactKeys: Object.keys(state.artifacts) },
    };
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** KB-16 pipeline — sequential 8-stage runner with failure capture and notify finalization. */
export async function runKbIngestPipeline(
  payload: KbIngestPayload,
  options: KbIngestPipelineOptions = {},
): Promise<KbIngestPipelineResult> {
  const now = options.now ?? (() => Date.now());
  const state: KbIngestPipelineState = { payload, artifacts: {} };
  const steps: KbIngestStepResult[] = [];
  const handlers = { ...DEFAULT_STEP_HANDLERS, ...(options.handlers ?? {}) };

  for (const step of KB_INGEST_STEPS) {
    if (state.failedStep && step !== "notify") {
      steps.push({
        step,
        ok: false,
        skipped: true,
        detail: `skipped_after:${state.failedStep}`,
      });
      continue;
    }

    const startedAt = now();
    try {
      const output = await handlers[step](state);
      steps.push({
        step,
        ok: true,
        detail: output?.detail ?? step,
        durationMs: Math.max(0, now() - startedAt),
        metadata: output?.metadata,
      });
    } catch (error) {
      state.failedStep = step;
      steps.push({
        step,
        ok: false,
        error: errorMessage(error),
        durationMs: Math.max(0, now() - startedAt),
      });
    }
  }

  const failedStep = steps.find((step) => !step.ok && !step.skipped)?.step;

  return {
    sourceId: payload.sourceId,
    documentId: payload.documentId,
    steps,
    ok: !failedStep,
    failedStep,
  };
}
