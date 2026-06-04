import type { KbSourceType } from "@keenai/storage/schema";

export const KEENI_KB_KB13 = {
  enabled: true,
  target: "kb.ingest.provenance",
  notes: "KB-13: provenance json + confidence = sourceAuthority × recency × feedback.",
} as const;

export type KbChunkProvenance = {
  sourceIds: string[];
  sourceTypes: string[];
  confirmedAt: string[];
  documentId: string;
  conversationId?: string;
  agentId?: string;
  feedbackScore?: number;
};

export type BuildKbChunkProvenanceInput = {
  sourceId: string;
  sourceType: KbSourceType;
  documentId: string;
  sourceUpdatedAt: Date | null;
  conversationId?: string;
  agentId?: string;
  feedbackScore?: number;
};

export function buildKbChunkProvenance(input: BuildKbChunkProvenanceInput): KbChunkProvenance {
  const confirmedAt = (input.sourceUpdatedAt ?? new Date()).toISOString();
  return {
    sourceIds: [input.sourceId],
    sourceTypes: [input.sourceType],
    confirmedAt: [confirmedAt],
    documentId: input.documentId,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.feedbackScore != null ? { feedbackScore: input.feedbackScore } : {}),
  };
}
