export type ExtractedMemoryRelation = {
  fromName: string;
  fromType?: "person" | "org" | "product" | "topic" | "feature";
  relationType:
    | "works_at"
    | "role"
    | "concerns"
    | "owns"
    | "mentioned_with"
    | "requested"
    | "questioned";
  toName: string;
  toType?: "person" | "org" | "product" | "topic" | "feature";
  confidence: number;
};

export type StubRelationExtractorInput = {
  title: string | null;
  summary: string;
  keyEvents?: string[];
};

/** Deterministic relation extractor for tests and local dev (no LLM). */
export function stubExtractRelations(input: StubRelationExtractorInput): ExtractedMemoryRelation[] {
  const text = [input.title, input.summary, ...(input.keyEvents ?? [])].filter(Boolean).join("\n");
  const relations: ExtractedMemoryRelation[] = [];
  const seen = new Set<string>();

  const add = (relation: ExtractedMemoryRelation) => {
    const key = `${relation.fromName}:${relation.relationType}:${relation.toName}`;
    if (seen.has(key)) return;
    seen.add(key);
    relations.push(relation);
  };

  const hasPro = /\bpro\b/i.test(text);
  const hasBilling = /\b(invoice|billing)\b/i.test(text);
  const orderMatch = text.match(/\bORD-\d+\b/i);

  if (hasBilling && hasPro) {
    add({
      fromName: "Billing",
      fromType: "topic",
      relationType: "concerns",
      toName: "Pro Plan",
      toType: "product",
      confidence: 0.8,
    });
  }

  if (hasBilling && orderMatch) {
    add({
      fromName: "Billing",
      fromType: "topic",
      relationType: "concerns",
      toName: orderMatch[0].toUpperCase(),
      toType: "product",
      confidence: 0.85,
    });
  }

  if (/\b(support|help)\b/i.test(text) && hasPro) {
    add({
      fromName: "Support",
      fromType: "topic",
      relationType: "questioned",
      toName: "Pro Plan",
      toType: "product",
      confidence: 0.7,
    });
  }

  return relations;
}
