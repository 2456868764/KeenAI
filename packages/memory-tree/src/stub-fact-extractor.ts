export type ExtractedMemoryFact = {
  predicate: string;
  object: unknown;
  category: string;
  confidence: number;
  importance?: number;
};

export type StubFactExtractorInput = {
  title: string | null;
  summary: string;
  keyEvents?: string[];
};

/** Deterministic fact extractor for tests and local dev (no LLM). */
export function stubExtractFacts(input: StubFactExtractorInput): ExtractedMemoryFact[] {
  const text = [input.title, input.summary, ...(input.keyEvents ?? [])].filter(Boolean).join("\n");
  const facts: ExtractedMemoryFact[] = [];

  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    facts.push({
      predicate: "contact_email",
      object: emailMatch[0],
      category: "contact",
      confidence: 0.85,
      importance: 0.7,
    });
  }

  const orderMatch = text.match(/\bORD-\d+\b/i);
  if (orderMatch) {
    facts.push({
      predicate: "order_id",
      object: orderMatch[0].toUpperCase(),
      category: "history",
      confidence: 0.9,
      importance: 0.8,
    });
  }

  if (/\b(pro|upgrade|plan)\b/i.test(text)) {
    facts.push({
      predicate: "interest_plan_upgrade",
      object: true,
      category: "preference",
      confidence: 0.75,
      importance: 0.65,
    });
  }

  if (/\b(invoice|billing)\b/i.test(text)) {
    facts.push({
      predicate: "topic_billing",
      object: true,
      category: "preference",
      confidence: 0.8,
      importance: 0.7,
    });
  }

  return facts;
}
