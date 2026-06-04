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
  CRYSTALLIZE: "keenai/kb.crystallize",
  CONVERSATION_CLOSED: "keenai/conversation.closed",
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

export type KbCrystallizePayload = {
  orgId: string;
  brandId: string;
  conversationId: string;
  userId: string;
  csatScore: number;
  question: string;
  answer: string;
  entities?: string[];
};

export type KbInngestHandlers = {
  runIngest: (payload: KbIngestPayload) => Promise<KbIngestPipelineResult>;
  runCrystallize: (payload: KbCrystallizePayload) => Promise<unknown>;
};

export type KbInngestStep = {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

export type KbInngestHandlerContext = {
  event: { data: unknown };
  step: KbInngestStep;
};

export type KbInngestClient = {
  createFunction: (
    config: Record<string, unknown>,
    trigger: Record<string, unknown>,
    handler: (ctx: KbInngestHandlerContext) => Promise<unknown>,
  ) => unknown;
};
