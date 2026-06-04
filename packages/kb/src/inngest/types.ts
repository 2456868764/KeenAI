export const KB_INGEST_STEPS = [
  "fetch",
  "parse",
  "clean",
  "chunk",
  "enrich",
  "embed",
  "index",
  "notify",
] as const;

export type KbIngestStep = (typeof KB_INGEST_STEPS)[number];

export const KB_INNGEST_EVENTS = {
  INGEST: "keenai/kb.ingest",
} as const;

export type KbIngestPayload = {
  orgId: string;
  brandId: string;
  sourceId: string;
  documentId?: string;
};

export type KbIngestStepResult = {
  step: KbIngestStep;
  ok: boolean;
  detail?: string;
};

export type KbIngestPipelineResult = {
  sourceId: string;
  documentId?: string;
  steps: KbIngestStepResult[];
};

export type KbInngestHandlers = {
  runIngest: (payload: KbIngestPayload) => Promise<KbIngestPipelineResult>;
};

export type KbInngestStep = {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

export type KbInngestHandlerContext = {
  event: { data: KbIngestPayload };
  step: KbInngestStep;
};

export type KbInngestClient = {
  createFunction: (
    config: Record<string, unknown>,
    trigger: Record<string, unknown>,
    handler: (ctx: KbInngestHandlerContext) => Promise<unknown>,
  ) => unknown;
};
