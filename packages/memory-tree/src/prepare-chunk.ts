import { canonicalizeConversationMessage, conversationMessageSourceRef } from "./canonicalize.js";
import { computeMemoryChunkId } from "./chunk-id.js";
import { computeFastScore } from "./fast-score.js";
import { redactPii } from "./privacy-filter.js";
import type { CanonicalAttachment, MemoryChunkLifecycle, MemoryChunkSource } from "./types.js";

export const KEENI_MEMORY_TREE_MT01 = {
  enabled: true,
  target: "memory_chunks",
  notes: "Hot-path canonicalize → content-addressed chunk id → fast-score (no DB).",
} as const;

export type PrepareMemoryChunkInput = {
  orgId: string;
  brandId: string;
  conversationId: string;
  messageId: string;
  senderType: string;
  sentAt: Date;
  plainText: string;
  isInternal?: boolean;
  attachments?: CanonicalAttachment[];
  /** When false, skip PII redaction (tests only). Defaults to true. */
  privacyFilter?: boolean;
};

export type PreparedMemoryChunk = {
  chunkId: string;
  source: MemoryChunkSource;
  sourceRef: string;
  bodyMd: string;
  body: string;
  lifecycle: MemoryChunkLifecycle;
  fastScore: number;
  signals: string[];
  /** False when fast-score marks the chunk as dropped. */
  shouldPersist: boolean;
};

/** MT-01 hot-path stub: canonicalize message → deterministic chunk id → fast-score. */
export function prepareMemoryChunkFromMessage(input: PrepareMemoryChunkInput): PreparedMemoryChunk {
  const source: MemoryChunkSource = input.isInternal ? "internal_note" : "conversation_message";
  const sourceRef = conversationMessageSourceRef(input.messageId);
  const privacyFilter = input.privacyFilter ?? true;
  const plainText = privacyFilter ? redactPii(input.plainText).text : input.plainText;
  const hasAttachments = (input.attachments?.length ?? 0) > 0;

  const doc = canonicalizeConversationMessage({
    orgId: input.orgId,
    brandId: input.brandId,
    source,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderType: input.senderType,
    sentAt: input.sentAt,
    plainText,
    attachments: input.attachments,
  });

  const chunkId = computeMemoryChunkId(input.orgId, input.brandId, sourceRef, doc.bodyMd);
  const scored = computeFastScore({
    plainText,
    source,
    senderType: input.senderType,
    hasAttachments,
  });

  return {
    chunkId,
    source,
    sourceRef,
    bodyMd: doc.bodyMd,
    body: doc.body,
    lifecycle: scored.lifecycle,
    fastScore: scored.score,
    signals: scored.signals,
    shouldPersist: scored.lifecycle !== "dropped",
  };
}
