import type { KbSourceType } from "@keenai/storage/schema";

export const KEENI_KB_KB21 = {
  enabled: true,
  target: "kb.brand_schema",
  notes: "KB-21: per-brand schema in kb_sources.config.kbSchema.",
} as const;

export type KbBrandEntityTypeRule = {
  name: string;
  description?: string;
};

export type KbBrandQualityGates = {
  crystallizeAutoMin?: number;
  crystallizeCandidateMin?: number;
};

export type KbBrandRetrievalDefaults = {
  limit?: number;
  rerank?: boolean;
  graphExpand?: boolean;
};

export type KbBrandIngestRules = {
  diffIndex?: boolean;
  extractEntities?: boolean;
};

export type KbBrandKbSchema = {
  entityTypes?: KbBrandEntityTypeRule[];
  ingestRules?: KbBrandIngestRules;
  qualityGates?: KbBrandQualityGates;
  retrieval?: KbBrandRetrievalDefaults;
};

export type KbSourceConfigWithSchema = {
  kbSchema?: KbBrandKbSchema;
  sourceType?: KbSourceType;
};

const DEFAULT_SCHEMA: KbBrandKbSchema = {
  entityTypes: [{ name: "topic" }, { name: "product" }, { name: "policy" }],
  ingestRules: { diffIndex: true, extractEntities: true },
  qualityGates: { crystallizeAutoMin: 0.8, crystallizeCandidateMin: 0.6 },
  retrieval: { limit: 10, rerank: true, graphExpand: true },
};

/** Parse KB-21 brand schema from kb_sources.config (stub-safe defaults). */
export function parseKbBrandSchema(
  config: Record<string, unknown> | null | undefined,
): KbBrandKbSchema {
  const raw = config?.kbSchema;
  if (!raw || typeof raw !== "object") return DEFAULT_SCHEMA;

  const schema = raw as KbBrandKbSchema;
  return {
    entityTypes: schema.entityTypes ?? DEFAULT_SCHEMA.entityTypes,
    ingestRules: { ...DEFAULT_SCHEMA.ingestRules, ...schema.ingestRules },
    qualityGates: { ...DEFAULT_SCHEMA.qualityGates, ...schema.qualityGates },
    retrieval: { ...DEFAULT_SCHEMA.retrieval, ...schema.retrieval },
  };
}

export function resolveKbQualityGates(schema: KbBrandKbSchema = DEFAULT_SCHEMA): {
  autoMin: number;
  candidateMin: number;
} {
  return {
    autoMin: schema.qualityGates?.crystallizeAutoMin ?? 0.8,
    candidateMin: schema.qualityGates?.crystallizeCandidateMin ?? 0.6,
  };
}
