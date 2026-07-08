import { searchKbChunks } from "@keenai/kb";
import type { KbSearchHit } from "@keenai/kb";
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
  score?: number;
  reason?: string;
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
    const normalizedBody = section.body
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
      .trim()
      .slice(0, 240);
    const key = normalizedBody || section.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(section);
  }
  return kept;
}

function tokenize(text: string | undefined): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9\u3400-\u9fff]+/i)
      .filter((term) => term.length > 2),
  );
}

function queryOverlap(query: string | undefined, section: UnifiedContextSection): number {
  const queryTerms = tokenize(query);
  if (queryTerms.size === 0) return 0;
  const sectionTerms = tokenize(`${section.title}\n${section.body}`);
  let shared = 0;
  for (const term of queryTerms) {
    if (sectionTerms.has(term)) shared += 1;
  }
  return shared / queryTerms.size;
}

export function rerankUnifiedContextSections(
  sections: UnifiedContextSection[],
  input: { intent: QueryIntent; weights: ContextRouteWeights; query?: string },
): UnifiedContextSection[] {
  return sections
    .map((section, index) => {
      const sourceWeight = section.source === "kb" ? input.weights.kb : input.weights.memory;
      const overlap = queryOverlap(input.query, section);
      const priorScore = section.score ?? 0;
      const score = sourceWeight + overlap * 0.45 + priorScore * 0.15 - index * 0.001;
      return {
        ...section,
        score: Number(score.toFixed(4)),
        reason: `intent:${input.intent};source:${section.source};overlap:${overlap.toFixed(2)}`,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function formatUnifiedContext(
  intent: QueryIntent,
  weights: ContextRouteWeights,
  sections: UnifiedContextSection[],
): string {
  const header = `[Unified Context · intent=${intent} · kb=${weights.kb} · memory=${weights.memory}]`;
  const body = sections.map((section) => {
    const score = section.score !== undefined ? ` · score=${section.score.toFixed(2)}` : "";
    return `## ${section.title} [${section.source}${score}]\n${section.body}`;
  });
  return [header, ...body].join("\n\n");
}

function kbHitToSection(hit: KbSearchHit): UnifiedContextSection {
  const prefix = hit.contextPrefix ? `[${hit.contextPrefix}] ` : "";
  const score = hit.rerankScore ?? hit.fusedScore ?? hit.confidence ?? 0;
  return {
    title: `Knowledge Base: ${hit.documentTitle}`,
    body: `${prefix}${hit.content}`,
    source: "kb",
    score,
  };
}

/** KB-22: assemble Memory Tree + KB with intent-based dynamic rerank and dedupe. */
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

  const query = input.instruction?.trim() ?? "";
  if (query && input.kbSearch) {
    const kb = await searchKbChunks(db, {
      orgId: input.orgId,
      brandId: input.brandId,
      q: query,
      chunkFts: input.kbSearch.chunkFts,
      chunkVector: input.kbSearch.chunkVector,
      queryEmbedder: input.kbSearch.queryEmbedder,
      limit: input.kbSearch.limit ?? 5,
    });
    sections.push(...kb.hits.map(kbHitToSection));
  }

  const deduped = dedupeSections(sections);
  const reranked = rerankUnifiedContextSections(deduped, { intent, weights, query });
  const text = formatUnifiedContext(intent, weights, reranked);

  return {
    intent,
    weights,
    sections: reranked,
    text,
    memoryScope: memory.scope,
    signals: [...memory.signals, `intent:${intent}`, "context:reranked"],
  };
}
