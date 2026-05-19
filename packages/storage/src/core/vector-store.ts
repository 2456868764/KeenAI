export interface VectorQuery {
  orgId: string;
  brandId?: string;
  embedding: number[];
  limit?: number;
  minScore?: number;
}

export interface VectorHit {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** Vector similarity search — LibSQL libsql_vector / PG pgvector implementations. */
export interface VectorStore {
  upsert(
    rows: Array<{ id: string; embedding: number[]; metadata?: Record<string, unknown> }>,
  ): Promise<void>;
  query(q: VectorQuery): Promise<VectorHit[]>;
  deleteByIds(ids: string[]): Promise<void>;
}
