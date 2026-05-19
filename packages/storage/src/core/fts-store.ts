export interface FtsQuery {
  orgId: string;
  brandId?: string;
  q: string;
  limit?: number;
}

export interface FtsHit {
  id: string;
  score: number;
  snippet?: string;
}

/** Full-text search — FTS5 (SQLite) / tsvector (PG) / Meilisearch. */
export interface FTSStore {
  index(doc: { id: string; orgId: string; brandId?: string; body: string }): Promise<void>;
  search(q: FtsQuery): Promise<FtsHit[]>;
  deleteByIds(ids: string[]): Promise<void>;
}
