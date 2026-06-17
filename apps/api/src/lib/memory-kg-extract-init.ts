import type { MemoryKgExtractor } from "@keenai/memory-tree";
import { createOpenAiMemoryKgExtractor, createStubMemoryKgExtractor } from "@keenai/memory/kg";
import type { ApiEnv } from "@keenai/shared";

let kgExtractor: MemoryKgExtractor = createStubMemoryKgExtractor();

export function resolveMemoryKgExtractor(env: ApiEnv): MemoryKgExtractor {
  if (
    env.MEMORY_KG_EXTRACT_ENABLED &&
    env.MEMORY_KG_EXTRACT_PROVIDER === "openai" &&
    env.OPENAI_API_KEY
  ) {
    return createOpenAiMemoryKgExtractor({
      apiKey: env.OPENAI_API_KEY,
      model: env.MEMORY_KG_EXTRACT_MODEL,
    });
  }

  return createStubMemoryKgExtractor();
}

export function initMemoryKgExtractorFromEnv(env: ApiEnv): void {
  kgExtractor = resolveMemoryKgExtractor(env);
}

export function setMemoryKgExtractor(extractor: MemoryKgExtractor): void {
  kgExtractor = extractor;
}

export function getMemoryKgExtractor(): MemoryKgExtractor {
  return kgExtractor;
}
