import { ConfidenceFilter } from "./confidence-filter.js";
import { PiiFilter } from "./pii-filter.js";
import { TrajectoryCompressor } from "./trajectory-compressor.js";
import type {
  BuildKeeniMemoryProcessorsInput,
  KeeniMemoryMessageList,
  KeeniMemoryProcessor,
} from "./types.js";

export const KEENI_MEMORY_PROCESSORS = {
  enabled: true,
  target: "agent.inputProcessors",
  notes: "Stub pipeline; Mastra Agent wiring lands in a later sprint.",
} as const;

export const DEFAULT_KEENI_MEMORY_PROCESSOR_OPTIONS = {
  trajectory: { keepLast: 5, targetTokens: 1500 },
  confidence: { minConfidence: 0.3 },
} as const;

/** Default KeenAI memory processor chain (PII → compress → confidence). */
export function buildKeeniMemoryProcessors(
  input: BuildKeeniMemoryProcessorsInput = {},
): KeeniMemoryProcessor[] {
  const processors: KeeniMemoryProcessor[] = [];

  if (input.pii !== false) {
    processors.push(new PiiFilter());
  }

  if (input.trajectory !== false) {
    processors.push(
      new TrajectoryCompressor({
        ...DEFAULT_KEENI_MEMORY_PROCESSOR_OPTIONS.trajectory,
        ...input.trajectory,
      }),
    );
  }

  if (input.confidence !== false) {
    processors.push(
      new ConfidenceFilter({
        ...DEFAULT_KEENI_MEMORY_PROCESSOR_OPTIONS.confidence,
        ...input.confidence,
      }),
    );
  }

  return processors;
}

export async function runKeeniMemoryProcessors(
  messages: KeeniMemoryMessageList,
  processors: KeeniMemoryProcessor[],
): Promise<KeeniMemoryMessageList> {
  let output = messages;
  for (const processor of processors) {
    output = await processor.process(output);
  }
  return output;
}
