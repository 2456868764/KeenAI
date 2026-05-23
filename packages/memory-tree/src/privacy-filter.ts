export type PiiPattern = {
  name: string;
  re: RegExp;
  mask: string | ((match: string, ...groups: string[]) => string);
};

export const DEFAULT_PII_PATTERNS: PiiPattern[] = [
  {
    name: "credit_card",
    re: /\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b/g,
    mask: (_match, _a, _b, _c, last4) => `****-****-****-${last4 ?? "####"}`,
  },
  {
    name: "email",
    re: /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
    mask: "<email>",
  },
  {
    name: "phone_cn",
    re: /\b1[3-9]\d{9}\b/g,
    mask: "<phone>",
  },
  {
    name: "id_card_cn",
    re: /\b\d{17}[\dXx]\b/g,
    mask: "<idcard>",
  },
  {
    name: "api_key",
    re: /(?:sk-[\w]{20,}|Bearer\s+[\w\-.]+)/g,
    mask: "<secret>",
  },
  {
    name: "password",
    re: /password["']?\s*[:=]\s*["']?(\S+)/gi,
    mask: "password=<redacted>",
  },
];

export type RedactPiiResult = {
  text: string;
  redactedKinds: string[];
};

/** Redact common PII/secrets before memory ingest. */
export function redactPii(
  input: string,
  opts?: { patterns?: readonly PiiPattern[] },
): RedactPiiResult {
  const patterns = opts?.patterns ?? DEFAULT_PII_PATTERNS;
  const redactedKinds = new Set<string>();
  let text = input;

  for (const pattern of patterns) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    text = text.replace(re, (match, ...groups) => {
      redactedKinds.add(pattern.name);
      if (typeof pattern.mask === "function") {
        return pattern.mask(match, ...(groups as string[]));
      }
      return pattern.mask;
    });
  }

  return { text, redactedKinds: [...redactedKinds] };
}
