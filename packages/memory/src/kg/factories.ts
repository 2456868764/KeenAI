import type { MemoryKgExtractor } from "@keenai/memory-tree";
import {
  type ExtractKgFromSummaryOptions,
  type KgSummaryExtractInput,
  extractKgFromSummaryText,
} from "./extractor.js";

/** Build a unified KG extractor (single LLM call for entities + relations). */
export function createMemoryKgExtractor(
  options: ExtractKgFromSummaryOptions = {},
): MemoryKgExtractor {
  const cache = new Map<string, ReturnType<typeof extractKgFromSummaryText>>();

  const cacheKey = (input: KgSummaryExtractInput) =>
    JSON.stringify({
      title: input.title,
      summary: input.summary,
      keyEvents: input.keyEvents ?? [],
    });

  return {
    model: options.model ? `llm/${options.model}` : "stub/rules",
    async extract(input) {
      const key = cacheKey(input);
      let pending = cache.get(key);
      if (!pending) {
        pending = extractKgFromSummaryText(input, options);
        cache.set(key, pending);
      }
      const result = await pending;
      return {
        entities: result.entities,
        relations: result.relations,
        source: result.source,
      };
    },
  };
}

export function createStubMemoryKgExtractor(): MemoryKgExtractor {
  return createMemoryKgExtractor({});
}

export function createOpenAiMemoryKgExtractor(input: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}): MemoryKgExtractor {
  return createMemoryKgExtractor({
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
  });
}
