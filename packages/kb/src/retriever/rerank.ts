export const BGE_RERANKER_MODEL_ID = "Xenova/bge-reranker-v2-m3";
export const KB_RERANK_RRF_TOP_K = 40;
export const KB_RERANK_OUTPUT_TOP_K = 15;

export type KbRerankCandidate = {
  id: string;
  text: string;
};

export type KbRerankScored = {
  id: string;
  score: number;
};

export type KbReranker = {
  model: string;
  rerank: (query: string, candidates: KbRerankCandidate[]) => Promise<KbRerankScored[]>;
};

export type KbRerankProvider = "stub" | "xenova";

type ClassificationPipeline = (text: string) => Promise<Array<{ label: string; score: number }>>;

let xenovaRerankerPromise: Promise<ClassificationPipeline> | null = null;

/** @internal Test-only cache reset. */
export function resetXenovaRerankerCacheForTests(): void {
  xenovaRerankerPromise = null;
}

async function loadXenovaReranker(): Promise<ClassificationPipeline> {
  if (!xenovaRerankerPromise) {
    xenovaRerankerPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("text-classification", BGE_RERANKER_MODEL_ID, {
        quantized: true,
      }) as Promise<ClassificationPipeline>;
    })();
  }
  return xenovaRerankerPromise;
}

function formatRerankPair(query: string, document: string): string {
  return `${query} [SEP] ${document}`;
}

function scoreFromClassificationOutput(output: Array<{ label: string; score: number }>): number {
  const top = output[0];
  if (!top) return 0;
  const label = top.label?.toUpperCase() ?? "";
  if (label === "LABEL_1" || label === "RELEVANT" || label === "1") {
    return top.score;
  }
  if (label === "LABEL_0" || label === "NOT_RELEVANT" || label === "0") {
    return 1 - top.score;
  }
  return top.score;
}

/** Lexical overlap reranker for tests and local dev (KB-08 stub). */
export function createStubKbReranker(): KbReranker {
  return {
    model: "stub/lexical-v1",
    async rerank(query, candidates) {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 1);

      return candidates
        .map((candidate) => {
          const haystack = candidate.text.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          return { id: candidate.id, score };
        })
        .sort((a, b) => b.score - a.score);
    },
  };
}

/** `@xenova/transformers` bge-reranker-v2-m3 (KB-08). */
export function createXenovaBgeReranker(): KbReranker {
  return {
    model: BGE_RERANKER_MODEL_ID,
    async rerank(query, candidates) {
      const pipe = await loadXenovaReranker();
      const scored = await Promise.all(
        candidates.map(async (candidate) => {
          const output = await pipe(formatRerankPair(query, candidate.text));
          return {
            id: candidate.id,
            score: scoreFromClassificationOutput(output),
          };
        }),
      );
      return scored.sort((a, b) => b.score - a.score);
    },
  };
}

export function createKbReranker(provider: KbRerankProvider = "stub"): KbReranker {
  return provider === "xenova" ? createXenovaBgeReranker() : createStubKbReranker();
}

export function resolveKbRerankProvider(
  env: { KB_RERANK_PROVIDER?: string } = process.env as { KB_RERANK_PROVIDER?: string },
): KbRerankProvider {
  return env.KB_RERANK_PROVIDER === "xenova" ? "xenova" : "stub";
}

export function toKbRerankCandidates<
  T extends { chunkId: string; content: string; contextPrefix: string | null },
>(hits: T[]): KbRerankCandidate[] {
  return hits.map((hit) => ({
    id: hit.chunkId,
    text: hit.contextPrefix ? `${hit.contextPrefix}\n${hit.content}` : hit.content,
  }));
}

/** Apply reranker to fused hits (RRF top-K → rerank → output top-K). */
export async function applyKbRerank<
  T extends { chunkId: string; content: string; contextPrefix: string | null },
>(
  query: string,
  hits: T[],
  reranker: KbReranker,
  opts?: { rrfTopK?: number; rerankTopK?: number },
): Promise<Array<T & { rerankScore: number }>> {
  const rrfTopK = opts?.rrfTopK ?? KB_RERANK_RRF_TOP_K;
  const rerankTopK = opts?.rerankTopK ?? KB_RERANK_OUTPUT_TOP_K;
  const pool = hits.slice(0, rrfTopK);
  if (pool.length <= 1) {
    return pool.map((hit, index) => ({ ...hit, rerankScore: pool.length - index }));
  }

  const scored = await reranker.rerank(query, toKbRerankCandidates(pool));
  const scoreById = new Map(scored.map((row) => [row.id, row.score]));

  return pool
    .filter((hit) => scoreById.has(hit.chunkId))
    .sort((a, b) => (scoreById.get(b.chunkId) ?? 0) - (scoreById.get(a.chunkId) ?? 0))
    .slice(0, rerankTopK)
    .map((hit) => ({ ...hit, rerankScore: scoreById.get(hit.chunkId) ?? 0 }));
}
