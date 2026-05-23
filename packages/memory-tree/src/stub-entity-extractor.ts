export type ExtractedMemoryEntity = {
  entityType: "person" | "org" | "product" | "topic" | "feature";
  name: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
};

export type StubEntityExtractorInput = {
  title: string | null;
  summary: string;
  keyEvents?: string[];
};

/** Deterministic entity extractor for tests and local dev (no LLM). */
export function stubExtractEntities(input: StubEntityExtractorInput): ExtractedMemoryEntity[] {
  const text = [input.title, input.summary, ...(input.keyEvents ?? [])].filter(Boolean).join("\n");
  const entities: ExtractedMemoryEntity[] = [];
  const seen = new Set<string>();

  const add = (entity: ExtractedMemoryEntity) => {
    const key = `${entity.entityType}:${entity.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push(entity);
  };

  const orderMatch = text.match(/\bORD-\d+\b/i);
  if (orderMatch) {
    add({
      entityType: "product",
      name: orderMatch[0].toUpperCase(),
      attributes: { kind: "order" },
    });
  }

  if (/\bpro\b/i.test(text)) {
    add({
      entityType: "product",
      name: "Pro Plan",
      aliases: ["Pro"],
      attributes: { kind: "plan" },
    });
  }

  if (/\b(invoice|billing)\b/i.test(text)) {
    add({
      entityType: "topic",
      name: "Billing",
      aliases: ["Invoice"],
    });
  }

  if (/\b(support|help)\b/i.test(text)) {
    add({
      entityType: "topic",
      name: "Support",
    });
  }

  return entities;
}
