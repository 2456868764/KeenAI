export type MemorySummaryFtsDoc = {
  id: string;
  orgId: string;
  brandId: string;
  scopeKey: string;
  level: number;
  body: string;
};

/** Optional FTS indexer injected at API bootstrap (LibSQL fts_memory_summaries). */
export type MemorySummaryFtsIndexer = {
  index(doc: MemorySummaryFtsDoc): Promise<void>;
};

export function memorySummaryFtsBody(input: {
  title: string | null;
  summary: string;
}): string {
  return input.title ? `${input.title}\n${input.summary}` : input.summary;
}

export async function indexMemorySummaryInFts(
  indexer: MemorySummaryFtsIndexer | null | undefined,
  row: {
    id: string;
    orgId: string;
    brandId: string;
    scopeKey: string;
    level: number;
    title: string | null;
    summary: string;
  },
): Promise<void> {
  if (!indexer) return;

  await indexer.index({
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    scopeKey: row.scopeKey,
    level: row.level,
    body: memorySummaryFtsBody(row),
  });
}
