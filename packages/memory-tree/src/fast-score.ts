import type { MemoryChunkLifecycle, MemoryChunkSource } from "./types.js";

export type FastScoreInput = {
  plainText: string;
  source: MemoryChunkSource;
  senderType: string;
  hasAttachments?: boolean;
};

export type FastScoreResult = {
  score: number;
  lifecycle: Extract<MemoryChunkLifecycle, "admitted" | "dropped">;
  signals: string[];
};

const ADMIT_THRESHOLD = 0.5;

const PLEASANTRY_PATTERNS = [
  /^thanks?\.?!?$/i,
  /^thank you\.?!?$/i,
  /^thx\.?!?$/i,
  /^谢谢\.?!?$/,
  /^好的?谢谢\.?!?$/,
  /^好的\.?!?$/,
  /^收到\.?!?$/,
  /^ok(?:ay)?\.?!?$/i,
  /^hi\.?!?$/i,
  /^hello\.?!?$/i,
  /^hey\.?!?$/i,
];

const BUSINESS_ENTITY_PATTERNS = [
  /\b[\w.-]+@[\w.-]+\.\w{2,}\b/i,
  /\b(?:order|订单)\s*[#:]?\s*[A-Z0-9-]{4,}\b/i,
  /\bORD[-_]?\d+\b/i,
  /\bSKU[-_]?[A-Z0-9]+\b/i,
  /\b[A-Z]{2,}-\d{3,}\b/,
  /#\d{4,}\b/,
];

function isPleasantry(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return PLEASANTRY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function hasBusinessEntity(text: string): boolean {
  return BUSINESS_ENTITY_PATTERNS.some((pattern) => pattern.test(text));
}

/** Heuristic fast-score on the hot path (no LLM). */
export function computeFastScore(input: FastScoreInput): FastScoreResult {
  const text = input.plainText.trim();
  const signals: string[] = [];

  if (input.source === "internal_note") {
    return { score: 1, lifecycle: "admitted", signals: ["internal_note"] };
  }

  if (input.senderType === "system") {
    return { score: 1, lifecycle: "admitted", signals: ["system_sender"] };
  }

  if (!text || text === "(empty)") {
    if (input.hasAttachments) {
      return { score: 0.75, lifecycle: "admitted", signals: ["attachments_only"] };
    }
    return { score: 0, lifecycle: "dropped", signals: ["empty"] };
  }

  if (isPleasantry(text)) {
    return { score: 0.1, lifecycle: "dropped", signals: ["pleasantry"] };
  }

  let score = 0.5;

  if (hasBusinessEntity(text)) {
    score += 0.35;
    signals.push("business_entity");
  }

  if (input.hasAttachments) {
    score += 0.15;
    signals.push("attachments");
  }

  if (text.length >= 30) {
    score += 0.1;
    signals.push("substantive_length");
  }

  score = Math.min(score, 1);
  const lifecycle = score >= ADMIT_THRESHOLD ? "admitted" : "dropped";

  return { score, lifecycle, signals };
}
