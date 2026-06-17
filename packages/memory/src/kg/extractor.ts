import type { ExtractedMemoryEntity, ExtractedMemoryRelation } from "@keenai/memory-tree";
import { stubExtractEntities, stubExtractRelations } from "@keenai/memory-tree";
import { type ExtractedKgPayload, extractedKgSchema } from "./schema.js";

export type KgSummaryExtractInput = {
  title: string | null;
  summary: string;
  keyEvents?: string[];
};

export type ExtractKgFromSummaryOptions = {
  model?: string | null;
  apiKey?: string | null;
  baseUrl?: string;
  /** Override for tests — defaults to Vercel AI SDK generateObject when omitted. */
  generateObject?: GenerateObjectFn;
};

export type GenerateObjectFn = <T>(input: {
  model: unknown;
  schema: { parse: (value: unknown) => T };
  prompt: string;
}) => Promise<{ object: T }>;

export type ExtractKgFromSummaryResult = {
  entities: ExtractedMemoryEntity[];
  relations: ExtractedMemoryRelation[];
  source: "llm" | "stub";
  model: string;
};

function formatSummaryPrompt(input: KgSummaryExtractInput): string {
  const parts = [
    input.title ? `Title: ${input.title}` : null,
    `Summary:\n${input.summary}`,
    input.keyEvents?.length
      ? `Key events:\n${input.keyEvents.map((e) => `- ${e}`).join("\n")}`
      : null,
  ].filter(Boolean);
  return parts.join("\n\n");
}

function mapKgPayload(
  payload: ExtractedKgPayload,
): Pick<ExtractKgFromSummaryResult, "entities" | "relations"> {
  return {
    entities: payload.entities.map((entity) => ({
      entityType: entity.type,
      name: entity.name.trim(),
      aliases: entity.aliases.filter(Boolean),
      attributes: entity.attributes,
    })),
    relations: payload.relations.map((relation) => ({
      fromName: relation.fromName.trim(),
      fromType: relation.fromType,
      relationType: relation.relationType,
      toName: relation.toName.trim(),
      toType: relation.toType,
      confidence: relation.confidence,
    })),
  };
}

function stubExtractKg(
  input: KgSummaryExtractInput,
): Pick<ExtractKgFromSummaryResult, "entities" | "relations"> {
  return {
    entities: stubExtractEntities(input),
    relations: stubExtractRelations(input),
  };
}

async function defaultGenerateObject<T>(input: {
  model: unknown;
  schema: { parse: (value: unknown) => T };
  prompt: string;
}): Promise<{ object: T }> {
  const { generateObject } = await import("ai");
  return generateObject({
    model: input.model as never,
    schema: input.schema as never,
    prompt: input.prompt,
  }) as Promise<{ object: T }>;
}

/** Extract entities + relations from a sealed summary snippet (P3-02 · generateObject). */
export async function extractKgFromSummaryText(
  input: KgSummaryExtractInput,
  options: ExtractKgFromSummaryOptions = {},
): Promise<ExtractKgFromSummaryResult> {
  const model = options.model?.trim() || null;
  const apiKey = options.apiKey?.trim() || null;

  if (!model || !apiKey) {
    const stub = stubExtractKg(input);
    return { ...stub, source: "stub", model: "stub/rules" };
  }

  try {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const client = createOpenAI({
      apiKey,
      baseURL: (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    });
    const generateObject = options.generateObject ?? defaultGenerateObject;
    const { object } = await generateObject({
      model: client(model),
      schema: extractedKgSchema,
      prompt: [
        "Extract named entities and relations from this customer support summary.",
        "Use concise canonical names. Relations must reference entity names from the same snippet.",
        "Prefer high-confidence links only.",
        "",
        formatSummaryPrompt(input),
      ].join("\n"),
    });

    const mapped = mapKgPayload(object);
    if (mapped.entities.length === 0 && mapped.relations.length === 0) {
      const stub = stubExtractKg(input);
      return { ...stub, source: "stub", model: "stub/rules" };
    }

    return {
      ...mapped,
      source: "llm",
      model: `openai/${model}`,
    };
  } catch {
    const stub = stubExtractKg(input);
    return { ...stub, source: "stub", model: "stub/rules" };
  }
}
