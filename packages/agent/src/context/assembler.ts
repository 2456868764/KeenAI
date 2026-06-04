import type { AssembleMemoryContextInput } from "@keenai/memory-tree";
import { assembleAgentMemoryContext } from "@keenai/memory-tree";
import type { KeenaiDb } from "@keenai/storage";

export const KEENI_KB_KB22 = {
  enabled: true,
  target: "agent.context.assembler",
  notes: "KB-22: unified KB + Memory context with intent weights and dedupe.",
} as const;

export const QUERY_INTENTS = ["factual", "personal", "troubleshooting", "procedural"] as const;
export type QueryIntent = (typeof QUERY_INTENTS)[number];

export type ContextRouteWeights = {
  kb: number;
  memory: number;
  graph: boolean;
};

export const CONTEXT_WEIGHTS_BY_INTENT: Record<QueryIntent, ContextRouteWeights> = {
  factual: { kb: 0.8, memory: 0.2, graph: true },
  personal: { kb: 0.2, memory: 0.8, graph: false },
  troubleshooting: { kb: 0.7, memory: 0.5, graph: true },
  procedural: { kb: 0.5, memory: 0.5, graph: true },
};

export type AssembleUnifiedContextInput = AssembleMemoryContextInput;

export type UnifiedContextSection = {
  title: string;
  body: string;
  source: "kb" | "memory";
};

export type AssembleUnifiedContextResult = {
  intent: QueryIntent;
  weights: ContextRouteWeights;
  sections: UnifiedContextSection[];
  text: string;
  memoryScope: string;
  signals: string[];
};

/** Classify query intent for KB-22 routing weights. */
export function classifyQueryIntent(instruction?: string): QueryIntent {
  const text = instruction?.trim() ?? "";
  if (/我的|订单|偏好|account|my\s+order/i.test(text)) return "personal";
  if (/error|报错|无法|failed|fix|troubleshoot/i.test(text)) return "troubleshooting";
  if (/步骤|如何|how to|procedure|流程/i.test(text)) return "procedural";
  return "factual";
}

function dedupeSections(sections: UnifiedContextSection[]): UnifiedContextSection[] {
  const seen = new Set<string>();
  const kept: UnifiedContextSection[] = [];
  for (const section of sections) {
    const key = `${section.source}:${section.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(section);
  }
  return kept;
}

/** KB-22: assemble Memory Tree + KB with intent-based weight metadata and deduped sections. */
export async function assembleUnifiedAgentContext(
  db: KeenaiDb,
  input: AssembleUnifiedContextInput,
): Promise<AssembleUnifiedContextResult> {
  const intent = classifyQueryIntent(input.instruction);
  const weights = CONTEXT_WEIGHTS_BY_INTENT[intent];
  const memory = await assembleAgentMemoryContext(db, input);

  const sections: UnifiedContextSection[] = memory.sections.map((section) => ({
    title: section.title,
    body: section.body,
    source: section.title.toLowerCase().includes("kb") ? "kb" : "memory",
  }));

  const deduped = dedupeSections(sections);
  const header = `[Unified Context · intent=${intent} · kb=${weights.kb} · memory=${weights.memory}]`;
  const text = [header, memory.text].filter(Boolean).join("\n\n");

  return {
    intent,
    weights,
    sections: deduped,
    text,
    memoryScope: memory.scope,
    signals: [...memory.signals, `intent:${intent}`],
  };
}
