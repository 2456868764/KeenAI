export const MEMORY_SCOPES = [
  "conversation",
  "customer",
  "brand_daily",
  "hybrid",
  "kb_only",
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export type ResolveMemoryScopeInput = {
  instruction?: string;
};

export type ResolveMemoryScopeResult = {
  scope: MemoryScope;
  signals: string[];
};

const KB_ONLY_PATTERNS = [
  /\bhow to use\b/i,
  /\bproduct docs?\b/i,
  /产品怎么用/,
  /功能说明/,
  /使用手册/,
  /documentation/i,
];

const BRAND_DAILY_PATTERNS = [
  /今天.*(support|工单|概况|情况)/i,
  /today'?s?\s+(support|ticket|overview)/i,
  /support\s+overview/i,
  /工单概况/,
  /daily digest/i,
];

const CUSTOMER_PATTERNS = [
  /这个客户/,
  /该客户/,
  /customer\s+(before|history|previously)/i,
  /之前.*客户/,
  /this customer/i,
];

const HYBRID_PATTERNS = [/结合.*(对话|今天|daily)/i, /context.*overview/i];

/** Route Memory Tree scope from agent instruction heuristics (09 appendix B). */
export function resolveMemoryScope(input: ResolveMemoryScopeInput): ResolveMemoryScopeResult {
  const text = input.instruction?.trim() ?? "";
  const signals: string[] = [];

  if (!text) {
    return { scope: "conversation", signals: ["default_conversation"] };
  }

  if (KB_ONLY_PATTERNS.some((pattern) => pattern.test(text))) {
    return { scope: "kb_only", signals: ["kb_only_intent"] };
  }

  if (HYBRID_PATTERNS.some((pattern) => pattern.test(text))) {
    return { scope: "hybrid", signals: ["hybrid_intent"] };
  }

  if (BRAND_DAILY_PATTERNS.some((pattern) => pattern.test(text))) {
    return { scope: "brand_daily", signals: ["brand_daily_intent"] };
  }

  if (CUSTOMER_PATTERNS.some((pattern) => pattern.test(text))) {
    return { scope: "customer", signals: ["customer_intent"] };
  }

  return { scope: "conversation", signals: ["default_conversation"] };
}

/** Parse a UTC digest date from instruction text (defaults to today UTC). */
export function resolveDigestDateFromInstruction(
  instruction?: string,
  explicitDate?: string,
): string | undefined {
  if (explicitDate) return explicitDate;

  const text = instruction ?? "";
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  if (/今天|today/i.test(text)) {
    return new Date().toISOString().slice(0, 10);
  }

  return undefined;
}
