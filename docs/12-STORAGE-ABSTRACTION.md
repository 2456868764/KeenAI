# KeenAI 存储抽象层（Storage Abstraction · TypeScript）

> **目标**：在 TypeScript 全栈下，提供基于接口的统一存储层，**同时支持** PostgreSQL 16+（`pgvector`）与 LibSQL / SQLite 3.45+（`libsql_vector` 或 `sqlite-vec`），覆盖关系数据、向量检索、全文检索三类工作负载，并与 [Mastra](https://mastra.ai/) 生态原生互通。

---

## 一、设计动机

### 1.1 为什么同时支持 LibSQL/SQLite 与 PostgreSQL

| 场景 | 推荐后端 | 理由 |
|------|----------|------|
| **本地开发 / CI 测试** | LibSQL（file URL） | 零依赖、秒级启动、文件存储 |
| **个人 / Indie SaaS** | LibSQL | 单文件部署、Litestream/Embedded Replicas 备份简单 |
| **小型团队自托管** | LibSQL or PG | 任意，按运维偏好 |
| **中大型 / 多租户云版** | PostgreSQL | 并发写、分区、副本、扩展生态 |
| **Edge / On-device** | LibSQL/SQLite | 嵌入式、离线优先；可同步 Turso/Cloudflare |
| **企业级合规** | PostgreSQL | 审计、复制、TDE、行级安全 |

> Featurebase 等竞品均锁定 PostgreSQL，使中小用户运维门槛较高。**KeenAI 提供 LibSQL 选项是「自托管易用性」的关键护城河**——`bun run start` 即可获得带向量检索的全功能客服系统。

### 1.2 同时支持的可行性

| 能力 | PostgreSQL 方案 | LibSQL/SQLite 方案 |
|------|-----------------|-------------------|
| 关系数据 | 原生 | 原生 |
| 向量检索 | [pgvector](https://github.com/pgvector/pgvector) | **LibSQL 内置 `libsql_vector`** / [sqlite-vec](https://github.com/asg017/sqlite-vec) |
| 全文检索 | `tsvector + GIN`（可选 Meilisearch 外置） | `FTS5`（嵌入；可选 Meilisearch 外置） |
| JSON | `jsonb` | `JSON1` 扩展（内置） |
| 并发写 | 高（MVCC） | 单 writer（WAL；可用 LibSQL embedded replica 减压） |
| 事务 | 完整 | 完整 |
| 多租户 | RLS / `WHERE org_id =` | `WHERE org_id =`；sqlite-vec 还可用 `partition key` 原生 |
| 复制 / HA | Patroni / repmgr | **LibSQL Embedded Replicas** / Litestream / Turso |

---

## 二、整体架构

```
┌────────────────────────────────────────────────────────────────┐
│                Application Domain Services                      │
│  Inbox │ Conv │ Ticket │ Agent │ Memory │ KB │ Workflow │ ...  │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ▼ (调用 TS 接口，不感知后端)
┌────────────────────────────────────────────────────────────────┐
│                Storage Abstraction Layer (@keenai/storage)      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │   Store    │ │ VectorStore│ │  FTSStore  │ │ ObjectStore│  │
│  │ (Drizzle + │ │            │ │            │ │ (S3 / Local│  │
│  │ TX + PubSub│ │            │ │            │ │  / R2)     │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│         │              │              │              │         │
│  ┌──────┴──────────────┴──────────────┴──────────────┴─────┐  │
│  │     Drizzle Schema Registry  +  drizzle-kit migrate     │  │
│  │  (single source of truth → PG / SQLite 双方言自动生成)   │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐
│  PostgreSQL Backend  │   │  LibSQL / SQLite     │
│                      │   │                      │
│ • postgres-js        │   │ • @libsql/client     │
│ • drizzle-orm/       │   │ • drizzle-orm/libsql │
│     postgres-js      │   │ • libsql_vector 内置 │
│ • pgvector           │   │ • FTS5               │
│   - HNSW / IVFFlat   │   │ • WAL mode           │
│ • tsvector + GIN     │   │ • Embedded Replicas  │
│ • partitioning       │   │     / Litestream     │
│ • LISTEN/NOTIFY      │   │                      │
│ • RLS                │   │ [兜底：better-sqlite3│
│                      │   │   + sqlite-vec]      │
└──────────────────────┘   └──────────────────────┘

外置可选（Production 推荐）：
  • Meilisearch（FTS 替代，性能更好）
  • Qdrant / Milvus（超大规模向量）
  • Redis（缓存 + BullMQ）
  • Inngest（事件 / Workflow / Pub-Sub 跨节点）

与 Mastra 生态的桥：
  • Store ⇄ MastraStorage（@mastra/pg.PostgresStore / @mastra/libsql.LibSQLStore）
  • VectorStore ⇄ MastraVector（PgVector / LibSQLVector）
```

---

## 三、核心 TypeScript 接口

> 所有接口定义在 `packages/storage/src/core/`，下游业务（Memory、KB、Inbox、Workflow）**只依赖接口**。

### 3.1 `Store` —— 关系数据 + 事务 + Pub/Sub

```ts
// packages/storage/src/core/store.ts
import type { z } from 'zod';

export type Dialect = 'postgres' | 'libsql' | 'sqlite';

export interface Store {
  readonly dialect: Dialect;
  ping(): Promise<void>;

  // Drizzle 实例（业务侧用这个写 query）
  readonly db: DrizzleDb;        // pg.NodePgDatabase | libsql.LibSQLDatabase | bs3.BetterSQLite3Database

  // 事务（统一 API；底层各自 SAVEPOINT 嵌套）
  transaction<T>(
    fn: (tx: TxScope) => Promise<T>,
    opts?: TxOptions,
  ): Promise<T>;

  // Pub/Sub（PG: LISTEN/NOTIFY；LibSQL/SQLite: Redis 或 in-memory fallback）
  listen<TPayload = unknown>(
    channel: string,
    handler: (msg: TPayload) => void | Promise<void>,
  ): Promise<Unsubscribe>;
  notify<TPayload>(channel: string, payload: TPayload): Promise<void>;

  // 健康 + 关闭
  health(): Promise<Health>;
  close(): Promise<void>;
}

export interface TxScope {
  readonly db: DrizzleDb;        // tx-scoped drizzle
  savepoint(name: string): Promise<void>;
  rollbackTo(name: string): Promise<void>;
}

export interface TxOptions {
  isolation?: 'read_committed' | 'repeatable_read' | 'serializable';
  readOnly?: boolean;
  deferrable?: boolean;          // PG only
}

export type Unsubscribe = () => Promise<void>;
export interface Health { ok: boolean; latencyMs: number; details?: Record<string, unknown> }
export type DrizzleDb = unknown; // 由 driver 包重新导出确切类型
```

### 3.2 `VectorStore` —— 向量检索

```ts
// packages/storage/src/core/vector.ts

export interface VectorStore {
  readonly dialect: Dialect;

  // 集合管理
  createCollection(spec: CollectionSpec): Promise<void>;
  dropCollection(name: string): Promise<void>;
  listCollections(): Promise<CollectionInfo[]>;

  // 写入（自动批量、自动序列化）
  upsert(collection: string, items: VectorItem[]): Promise<void>;
  delete(collection: string, ids: string[]): Promise<void>;

  // 检索
  search(req: SearchRequest): Promise<SearchResponse>;

  // 索引（PG: HNSW/IVFFlat；LibSQL/SQLite: vec0 partition key）
  ensureIndex(collection: string, spec: IndexSpec): Promise<void>;
}

export interface CollectionSpec {
  name: string;
  dimension: number;             // 必填
  metric: DistanceMetric;
  type?: VectorType;             // 默认 float32

  // 分区键（多租户 / 高效过滤）
  //   PG: 转为普通列 + 复合索引
  //   sqlite-vec: vec0 partition key
  //   libsql_vector: WHERE 过滤
  partitionKeys?: PartitionKey[];

  // 元数据列（用于 WHERE 过滤）
  metadataColumns?: MetadataColumn[];

  // 辅助列（不参与检索，便于一次查询带回展示字段）
  auxiliaryColumns?: AuxColumn[];
}

export type DistanceMetric = 'cosine' | 'l2' | 'ip' | 'l1' | 'hamming';
export type VectorType = 'float32' | 'float16' | 'int8' | 'binary';

export interface PartitionKey { name: string; type: 'int' | 'text' }
export interface MetadataColumn { name: string; type: 'int' | 'text' | 'real' | 'bool' | 'json' }
export interface AuxColumn { name: string; type: 'text' | 'json' }

export interface VectorItem {
  id: string;
  vector: Float32Array | number[];
  partition?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  auxiliary?: Record<string, unknown>;
}

export interface SearchRequest {
  collection: string;
  queryVector: Float32Array | number[];
  topK: number;
  partitionFilter?: Record<string, unknown>;    // 必须命中 partition key
  metadataFilter?: Expr;
  includeMetadata?: boolean;
  includeAux?: boolean;
  includeVector?: boolean;
  minScore?: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  latencyMs: number;
  queryId?: string;
}

export interface SearchHit {
  id: string;
  distance: number;
  score: number;                  // 归一化 0~1
  metadata?: Record<string, unknown>;
  auxiliary?: Record<string, unknown>;
  vector?: Float32Array;
}

export interface IndexSpec {
  kind: 'hnsw' | 'ivfflat' | 'flat';
  m?: number;                     // HNSW
  efConstruction?: number;        // HNSW
  lists?: number;                 // IVFFlat
  metric?: DistanceMetric;
}
```

### 3.3 `FTSStore` —— 全文检索

```ts
// packages/storage/src/core/fts.ts

export interface FTSStore {
  readonly dialect: Dialect;

  createIndex(spec: FTSIndexSpec): Promise<void>;
  dropIndex(name: string): Promise<void>;

  upsert(index: string, docs: FTSDoc[]): Promise<void>;
  delete(index: string, ids: string[]): Promise<void>;

  search(req: FTSRequest): Promise<FTSResponse>;
}

export interface FTSIndexSpec {
  name: string;
  fields: FTSField[];             // { name, weight, tokenizer? }
  tokenizer?: Tokenizer;
  stemLanguage?: string;
  stopwords?: string[];
  synonyms?: Record<string, string[]>;
  filters?: FilterColumn[];       // facet 字段
}

export type Tokenizer =
  | 'unicode61'   // SQLite 默认
  | 'porter'      // 英文词干
  | 'jieba'       // 中文（应用层预处理 或 ICU 扩展）
  | 'icu'         // 多语言
  | 'simple';

export interface FTSDoc {
  id: string;
  fields: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface FTSRequest {
  index: string;
  query: string;
  queryOperator?: 'and' | 'or' | 'phrase';
  filter?: Expr;
  facets?: string[];
  sort?: SortField[];
  highlight?: Highlight;
  limit?: number;
  offset?: number;
}

export interface FTSResponse {
  hits: FTSHit[];
  total: number;
  facets?: Record<string, Array<{ value: string; count: number }>>;
  latencyMs: number;
}
```

### 3.4 `Expr` —— 跨方言过滤 DSL

> 关键点：业务代码用 **Expr DSL** 描述过滤条件，由 driver 翻译为各自方言（PG 的 `WHERE` / SQLite 的 `WHERE` / sqlite-vec 的 `WHERE` 表达式），避免硬编码 SQL。

```ts
// packages/storage/src/core/expr.ts

export type Expr =
  | { kind: 'eq';    field: string; value: unknown }
  | { kind: 'ne';    field: string; value: unknown }
  | { kind: 'in';    field: string; values: unknown[] }
  | { kind: 'nin';   field: string; values: unknown[] }
  | { kind: 'gt' | 'lt' | 'gte' | 'lte'; field: string; value: unknown }
  | { kind: 'between'; field: string; lo: unknown; hi: unknown }
  | { kind: 'like';  field: string; pattern: string }
  | { kind: 'json';  path: string; value: unknown }       // PG: jsonb #> ; SQLite: json_extract
  | { kind: 'and';   exprs: Expr[] }
  | { kind: 'or';    exprs: Expr[] }
  | { kind: 'not';   expr: Expr };

// 工厂函数（小写）
export const eq      = (field: string, value: unknown): Expr => ({ kind: 'eq', field, value });
export const inAny   = (field: string, values: unknown[]): Expr => ({ kind: 'in', field, values });
export const gt      = (field: string, value: unknown): Expr => ({ kind: 'gt', field, value });
export const between = (field: string, lo: unknown, hi: unknown): Expr => ({ kind: 'between', field, lo, hi });
export const like    = (field: string, pattern: string): Expr => ({ kind: 'like', field, pattern });
export const json    = (path: string, value: unknown): Expr => ({ kind: 'json', path, value });
export const and     = (...exprs: Expr[]): Expr => ({ kind: 'and', exprs });
export const or      = (...exprs: Expr[]): Expr => ({ kind: 'or', exprs });
export const not     = (expr: Expr): Expr => ({ kind: 'not', expr });
```

示例：

```ts
import { and, eq, inAny, gt, type Expr } from '@keenai/storage';

const filter: Expr = and(
  eq('org_id',   'org_001'),
  eq('brand_id', 'brand_main'),
  inAny('locale', ['zh', 'en']),
  gt('created_at', new Date(Date.now() - 90 * 86400_000)),
);
```

| Expr | PostgreSQL | SQLite / LibSQL | sqlite-vec WHERE |
|------|-----------|-----------------|------------------|
| `eq('org_id', 'x')` | `org_id = $1` | `org_id = ?` | `org_id = ?` |
| `inAny('locale', [...])` | `locale = ANY($1)` | `locale IN (?,?)` | `locale IN (?,?)` |
| `json('metadata.tag', 'vip')` | `metadata->>'tag' = $1` | `json_extract(metadata,'$.tag') = ?` | n/a |
| `and(a, b)` | `(a) AND (b)` | `(a) AND (b)` | `(a) AND (b)` |

---

## 四、PostgreSQL 实现

### 4.1 Drizzle + postgres-js

```ts
// packages/storage/src/postgres/store.ts
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@keenai/db/schema';
import type { Store, TxScope, TxOptions, Unsubscribe } from '../core/store.js';

export class PostgresStore implements Store {
  readonly dialect = 'postgres' as const;
  readonly db: PostgresJsDatabase<typeof schema>;
  readonly #sql: postgres.Sql;

  constructor(dsn: string, opts?: { max?: number }) {
    this.#sql = postgres(dsn, {
      max: opts?.max ?? 50,
      prepare: false,
      transform: { undefined: null },
    });
    this.db = drizzle(this.#sql, { schema });
  }

  async ping() { await this.#sql`SELECT 1`; }

  async transaction<T>(fn: (tx: TxScope) => Promise<T>, opts?: TxOptions): Promise<T> {
    return this.db.transaction(async (txDb) => {
      const tx: TxScope = {
        db: txDb,
        async savepoint(name) { await txDb.execute(`SAVEPOINT ${name}`); },
        async rollbackTo(name) { await txDb.execute(`ROLLBACK TO SAVEPOINT ${name}`); },
      };
      return fn(tx);
    }, { isolationLevel: opts?.isolation, accessMode: opts?.readOnly ? 'read only' : 'read write' });
  }

  async listen<T>(channel: string, handler: (msg: T) => void | Promise<void>): Promise<Unsubscribe> {
    const sub = await this.#sql.listen(channel, async (raw) => {
      await handler(JSON.parse(raw) as T);
    });
    return async () => { await sub.unlisten(); };
  }

  async notify<T>(channel: string, payload: T) {
    await this.#sql`SELECT pg_notify(${channel}, ${JSON.stringify(payload)})`;
  }

  async health() {
    const t0 = performance.now();
    await this.ping();
    return { ok: true, latencyMs: performance.now() - t0 };
  }

  async close() { await this.#sql.end(); }
}
```

### 4.2 VectorStore（pgvector + Drizzle）

```ts
// packages/db/schema/vectors.ts
import { pgTable, text, integer, real, jsonb, index } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const kbChunks = pgTable('kb_chunks', {
  id:        text('id').primaryKey(),
  orgId:     text('org_id').notNull(),
  brandId:   text('brand_id').notNull(),
  locale:    text('locale'),
  embedding: vector('embedding', { dimensions: 1024 }),
  metadata:  jsonb('metadata'),
  content:   text('content'),
}, (t) => ({
  orgBrandIdx: index('idx_kb_org_brand').on(t.orgId, t.brandId),
  // HNSW 索引由自定义迁移创建，drizzle-kit 不直接支持 HNSW 选项
}));
```

```ts
// packages/storage/src/postgres/vector.ts
import { sql, eq as drEq, and as drAnd } from 'drizzle-orm';
import type { VectorStore, SearchRequest, SearchResponse } from '../core/vector.js';
import { translateExprToPg } from './expr.js';

export class PgVectorStore implements VectorStore {
  readonly dialect = 'postgres' as const;
  constructor(private readonly store: PostgresStore) {}

  async createCollection(spec) {
    await this.store.db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS vector`));
    const ddl = buildCreateTablePg(spec);       // 包含 partition keys 普通列 + metadata 普通/jsonb 列
    await this.store.db.execute(sql.raw(ddl));
  }

  async upsert(collection: string, items) {
    await this.store.transaction(async (tx) => {
      for (const it of items) {
        // pgvector 接受 '[0.1,0.2,...]' 字符串或 vector 类型
        const v = `[${Array.from(it.vector).join(',')}]`;
        const cols = buildUpsertColumns(it);
        await tx.db.execute(sql.raw(`
          INSERT INTO "${collection}" (id, embedding, ${cols.names})
          VALUES ($1, $2::vector, ${cols.placeholders})
          ON CONFLICT (id) DO UPDATE SET
            embedding = EXCLUDED.embedding,
            ${cols.updates}
        `));
      }
    });
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const queryVec = `[${Array.from(req.queryVector).join(',')}]`;
    const op = req.metric === 'l2' ? '<->' : req.metric === 'ip' ? '<#>' : '<=>';
    const where = translateExprToPg({
      ...(req.partitionFilter ?? {}),
      ...(req.metadataFilter ?? {}),
    });
    const rows = await this.store.db.execute(sql.raw(`
      SELECT id,
             embedding ${op} '${queryVec}'::vector AS distance,
             metadata
      FROM "${req.collection}"
      WHERE ${where.sql || 'TRUE'}
      ORDER BY embedding ${op} '${queryVec}'::vector
      LIMIT ${req.topK}
    `));
    return mapPgHits(rows);
  }

  async ensureIndex(collection, spec) {
    const opclass = spec.metric === 'l2' ? 'vector_l2_ops'
                  : spec.metric === 'ip' ? 'vector_ip_ops'
                  : 'vector_cosine_ops';
    if (spec.kind === 'hnsw') {
      await this.store.db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "${collection}_hnsw_idx"
          ON "${collection}" USING hnsw (embedding ${opclass})
          WITH (m = ${spec.m ?? 16}, ef_construction = ${spec.efConstruction ?? 200})
      `));
    } else if (spec.kind === 'ivfflat') {
      await this.store.db.execute(sql.raw(`
        CREATE INDEX IF NOT EXISTS "${collection}_ivf_idx"
          ON "${collection}" USING ivfflat (embedding ${opclass})
          WITH (lists = ${spec.lists ?? 100})
      `));
    }
  }
}
```

> 注：Drizzle 不会自动创建 PG 扩展。生成 `CREATE EXTENSION vector;` 自定义迁移：
> ```bash
> bunx drizzle-kit generate --custom
> ```
> 并在生成文件中加入 `CREATE EXTENSION IF NOT EXISTS vector;`。

### 4.3 Hybrid Search（PG 单 SQL RRF）

```ts
async function pgHybridSearch(store: PostgresStore, req: HybridRequest) {
  const v = `[${Array.from(req.vector).join(',')}]`;
  return store.db.execute(sql.raw(`
    WITH semantic AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> '${v}'::vector) AS rank
      FROM kb_chunks
      WHERE org_id = $1 AND brand_id = $2
      ORDER BY embedding <=> '${v}'::vector
      LIMIT 30
    ),
    keyword AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(to_tsvector('simple', content), query) DESC
      ) AS rank
      FROM kb_chunks, plainto_tsquery('simple', $3) query
      WHERE to_tsvector('simple', content) @@ query
        AND org_id = $1 AND brand_id = $2
      LIMIT 30
    )
    SELECT COALESCE(s.id, k.id) AS id,
           COALESCE(1.0/(60 + s.rank), 0) + COALESCE(1.0/(60 + k.rank), 0) AS score
    FROM semantic s FULL OUTER JOIN keyword k ON s.id = k.id
    ORDER BY score DESC
    LIMIT ${req.topK}
  `));
}
```

### 4.4 FTSStore（tsvector + GIN）

```ts
// 中文需要 zhparser 或 simple + 应用层 jieba 预分词
// 简体中文方案 A：postgres + zhparser 扩展
// 简体中文方案 B：应用层用 nodejieba 分词 → 写入预分词文本，索引 to_tsvector('simple', tokens)
```

---

## 五、LibSQL / SQLite 实现

### 5.1 Driver 选择

| Driver | 类型 | 何时用 |
|--------|------|--------|
| `@libsql/client` | Native + WASM | **默认**：内置向量、HTTP API、Embedded Replicas、Turso 同源 |
| `better-sqlite3` + `sqlite-vec` | Native（CGO） | 完全离线、需要 sqlite-vec partition key、Node 端 |
| `bun:sqlite` + `sqlite-vec`（loadable extension） | Bun-only | 纯 Bun 部署，零原生编译 |

**KeenAI 选择**：默认 **LibSQL**；当用户显式要 `STORAGE_DRIVER=sqlite` 时用 `better-sqlite3 + sqlite-vec`。

```ts
// packages/storage/src/libsql/store.ts
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@keenai/db/schema';
import type { Store, TxScope, TxOptions, Unsubscribe } from '../core/store.js';

export class LibSQLStore implements Store {
  readonly dialect = 'libsql' as const;
  readonly db: LibSQLDatabase<typeof schema>;
  readonly #client: Client;
  readonly #pubsub: InMemoryPubSub;     // LibSQL 没有 LISTEN/NOTIFY；Production 应换 Redis

  constructor(url: string, opts?: { authToken?: string; syncUrl?: string; syncInterval?: number }) {
    this.#client = createClient({
      url,                                // 'file:keenai.db' | 'libsql://xxx.turso.io'
      authToken: opts?.authToken,
      syncUrl:   opts?.syncUrl,           // Embedded Replicas 同步源
      syncInterval: opts?.syncInterval,
    });
    this.db = drizzle(this.#client, { schema });
    this.#pubsub = new InMemoryPubSub();

    // 性能 PRAGMA（仅本地文件库有效）
    if (url.startsWith('file:')) {
      this.#client.execute('PRAGMA journal_mode=WAL');
      this.#client.execute('PRAGMA synchronous=NORMAL');
      this.#client.execute('PRAGMA mmap_size=268435456');
      this.#client.execute('PRAGMA temp_store=MEMORY');
      this.#client.execute('PRAGMA busy_timeout=5000');
      this.#client.execute('PRAGMA foreign_keys=ON');
    }
  }

  async ping() { await this.#client.execute('SELECT 1'); }

  async transaction<T>(fn: (tx: TxScope) => Promise<T>, _opts?: TxOptions): Promise<T> {
    return this.db.transaction(async (txDb) => {
      let sp = 0;
      const tx: TxScope = {
        db: txDb,
        async savepoint(name) { await txDb.run(`SAVEPOINT ${name || `sp_${++sp}`}`); },
        async rollbackTo(name) { await txDb.run(`ROLLBACK TO SAVEPOINT ${name}`); },
      };
      return fn(tx);
    });
  }

  async listen<T>(channel: string, handler: (msg: T) => void | Promise<void>): Promise<Unsubscribe> {
    return this.#pubsub.subscribe(channel, handler);
  }
  async notify<T>(channel: string, payload: T) {
    await this.#pubsub.publish(channel, payload);
  }

  async health() {
    const t0 = performance.now();
    await this.ping();
    return { ok: true, latencyMs: performance.now() - t0 };
  }
  async close() { this.#client.close(); }
}
```

> 跨节点 Pub/Sub：在多副本/HA 场景下，注入 `RedisPubSub`（基于 `ioredis` 的 `pub/sub`）替换 `InMemoryPubSub`，业务层无感。

### 5.2 VectorStore（LibSQL `libsql_vector` 内置）

LibSQL 内置向量类型，写法接近 pgvector：

```ts
// packages/db/schema/libsql-vectors.ts
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// LibSQL 用 F32_BLOB(N) 类型；通过 vector32() / vector_distance_cos() 函数操作
export const kbChunksSqlite = sqliteTable('kb_chunks', {
  id:        text('id').primaryKey(),
  orgId:     text('org_id').notNull(),
  brandId:   text('brand_id').notNull(),
  locale:    text('locale'),
  embedding: blob('embedding'),           // F32_BLOB(1024) — Drizzle 用 blob 表达，SQL 自定义
  metadata:  text('metadata'),            // JSON.stringify
  content:   text('content'),
});
```

```ts
// packages/storage/src/libsql/vector.ts
import { sql } from 'drizzle-orm';
import type { VectorStore, SearchRequest } from '../core/vector.js';
import { translateExprToSqlite } from './expr.js';

export class LibSQLVectorStore implements VectorStore {
  readonly dialect = 'libsql' as const;
  constructor(private readonly store: LibSQLStore) {}

  async createCollection(spec) {
    const cols = buildSqliteCols(spec);
    await this.store.db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS "${spec.name}" (
        id TEXT PRIMARY KEY,
        embedding F32_BLOB(${spec.dimension}),
        ${cols.partitionKeyDdl},
        ${cols.metadataDdl},
        ${cols.auxiliaryDdl}
      )
    `));
    // 向量索引：LibSQL 内置 HNSW
    await this.store.db.run(sql.raw(`
      CREATE INDEX IF NOT EXISTS "${spec.name}_hnsw_idx"
      ON "${spec.name}" (libsql_vector_idx(embedding, 'metric=${spec.metric}'))
    `));
  }

  async upsert(collection, items) {
    await this.store.transaction(async (tx) => {
      for (const it of items) {
        const v = `vector32('[${Array.from(it.vector).join(',')}]')`;
        const cols = buildUpsertCols(it);
        await tx.db.run(sql.raw(`
          INSERT OR REPLACE INTO "${collection}" (id, embedding, ${cols.names})
          VALUES (?, ${v}, ${cols.placeholders})
        `).bind(it.id, ...cols.values));
      }
    });
  }

  async search(req: SearchRequest) {
    const v = `vector32('[${Array.from(req.queryVector).join(',')}]')`;
    const where = translateExprToSqlite({ ...req.partitionFilter, ...req.metadataFilter });
    // vector_top_k 索引函数（HNSW）
    const rows = await this.store.db.all(sql.raw(`
      SELECT id, vector_distance_cos(embedding, ${v}) AS distance, metadata
      FROM vector_top_k('${req.collection}_hnsw_idx', ${v}, ${req.topK}) AS t
      JOIN "${req.collection}" USING (rowid)
      ${where.sql ? `WHERE ${where.sql}` : ''}
    `));
    return mapSqliteHits(rows);
  }

  async ensureIndex() { /* LibSQL 创建表时已建索引 */ }
}
```

### 5.3 VectorStore（兜底：`better-sqlite3 + sqlite-vec`）

```ts
// packages/storage/src/sqlite/vector.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database('keenai.db');
sqliteVec.load(db);

// 创建 vec0 虚拟表（含 partition key）
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_kb_chunks USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[1024],
    org_id TEXT PARTITION KEY,
    brand_id TEXT PARTITION KEY,
    locale TEXT,
    +content TEXT                -- + 前缀：辅助列
  );
`);

// 写入
const stmt = db.prepare(`
  INSERT OR REPLACE INTO vec_kb_chunks(id, embedding, org_id, brand_id, locale, content)
  VALUES (?, vec_f32(?), ?, ?, ?, ?)
`);
stmt.run(id, Buffer.from(new Float32Array(vec).buffer), org, brand, locale, content);

// 检索
const hits = db.prepare(`
  SELECT id, distance, locale, content
  FROM vec_kb_chunks
  WHERE embedding MATCH vec_f32(?)
    AND k = ?
    AND org_id = ?
    AND brand_id = ?
  ORDER BY distance
`).all(Buffer.from(new Float32Array(q).buffer), 10, 'org_001', 'brand_main');
```

### 5.4 FTSStore（FTS5）

```ts
// packages/storage/src/libsql/fts.ts
export class LibSQLFTSStore implements FTSStore {
  readonly dialect = 'libsql' as const;
  constructor(private readonly store: LibSQLStore) {}

  async createIndex(spec) {
    // 中文：tokenize='trigram' 或应用层 nodejieba 预分词后用 unicode61
    const tokenizer = mapTokenizerToSqlite(spec.tokenizer);
    const fields    = spec.fields.map((f) => `"${f.name}"`).join(',');
    await this.store.db.run(sql.raw(`
      CREATE VIRTUAL TABLE IF NOT EXISTS "${spec.name}"
      USING fts5(${fields}, tokenize='${tokenizer}')
    `));
  }

  async upsert(index, docs) {
    await this.store.transaction(async (tx) => {
      for (const d of docs) {
        const cols = Object.keys(d.fields);
        await tx.db.run(sql.raw(`
          INSERT OR REPLACE INTO "${index}" (rowid, ${cols.join(',')})
          VALUES ((SELECT rowid FROM "${index}" WHERE rowid = ?), ${cols.map(() => '?').join(',')})
        `).bind(d.id, ...cols.map((c) => d.fields[c])));
      }
    });
  }

  async search(req: FTSRequest) {
    const where = req.filter ? translateExprToSqlite(req.filter).sql : '';
    const rows = await this.store.db.all(sql.raw(`
      SELECT rowid AS id, bm25("${req.index}") AS score, *
      FROM "${req.index}"
      WHERE "${req.index}" MATCH ? ${where ? `AND ${where}` : ''}
      ORDER BY score
      LIMIT ? OFFSET ?
    `).bind(req.query, req.limit ?? 10, req.offset ?? 0));
    return mapFtsHits(rows);
  }
}
```

### 5.5 Hybrid Search（应用层 RRF，所有 SQLite-family 后端共用）

```ts
// packages/storage/src/hybrid.ts
export async function hybridSearch(vs: VectorStore, fts: FTSStore, req: HybridRequest) {
  const [vec, key] = await Promise.all([
    vs.search(req.toVectorRequest()),
    fts.search(req.toFtsRequest()),
  ]);
  const scores = new Map<string, number>();
  const k = 60;
  vec.hits.forEach((h, r) => scores.set(h.id, (scores.get(h.id) ?? 0) + 1 / (k + r)));
  key.hits.forEach((h, r) => scores.set(h.id, (scores.get(h.id) ?? 0) + 1 / (k + r)));
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, req.topK)
    .map(([id, score]) => ({ id, score }));
}
```

> 注：PG 后端也支持同一 `hybridSearch` 函数。如果需要极致性能，PG driver 可走 §4.3 的单 SQL RRF。

### 5.6 SQLite 单 writer 限制对策

WAL 模式下「多 reader + 1 writer」是硬限制。KeenAI 应对：

| 措施 | 说明 |
|------|------|
| **写请求串行化** | 在 `Store` 内置 `p-queue`（concurrency 1）包装写操作，其余写入排队 |
| **批量写入** | Inbox 消息 / Memory observation 走 buffer，定时 flush（10ms 或 100 条） |
| **读副本** | LibSQL Embedded Replicas（自动同步）或 Litestream 只读副本，分析查询走副本 |
| **拆库** | 按业务域分库（`keenai.db` / `memory.db` / `kb.db`），减少锁争抢 |

### 5.7 HA / 备份

#### 5.7.1 LibSQL Embedded Replicas（**推荐**）

```ts
const store = new LibSQLStore('file:./local.db', {
  syncUrl: 'libsql://keenai-prod.turso.io',
  authToken: process.env.TURSO_TOKEN,
  syncInterval: 60,                       // 秒
});
// 本地读 <1ms，写入透传到远端，断网仍可读写
```

#### 5.7.2 Litestream（备份兜底）

```yaml
# litestream.yml
dbs:
  - path: /data/keenai.db
    replicas:
      - type: s3
        bucket: keenai-backup
        path: keenai/db
        region: us-east-1
        sync-interval: 10s
        retention: 720h
```

恢复：

```bash
litestream restore -o keenai.db s3://keenai-backup/keenai/db
```

---

## 六、Migration 双方言（Drizzle Kit）

### 6.1 Drizzle Schema 即唯一来源

```ts
// packages/db/schema/index.ts
export * from './users';
export * from './conversations';
export * from './kb-chunks';
// ...
```

每张表用 dialect-specific 模块定义（`pg-core` 或 `sqlite-core`），共享列类型与索引语义；为了避免重复，KeenAI 用一个 **Schema Factory** 把 schema 定义为函数，按 dialect 调用：

```ts
// packages/db/schema/conversations.ts
import { defineSchema } from '../helpers/define.js';

export const conversations = defineSchema({
  table: 'conversations',
  columns: (c) => ({
    id:        c.id(),
    orgId:     c.text('org_id').notNull(),
    brandId:   c.text('brand_id').notNull(),
    status:    c.text('status').notNull().default('open'),
    metadata:  c.json('metadata'),
    createdAt: c.timestamptz('created_at').notNull().defaultNow(),
  }),
  indexes: (i) => [
    i('idx_conv_org').on('org_id', 'brand_id', 'created_at'),
  ],
});
```

`defineSchema` 在 `dialect === 'postgres'` 时输出 `pgTable(...)`，在 `dialect === 'libsql' | 'sqlite'` 时输出 `sqliteTable(...)`，统一类型与 query API。

### 6.2 配置

```ts
// drizzle.config.pg.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/schema',
  out: './packages/db/migrations/postgres',
  dbCredentials: { url: process.env.DATABASE_URL! },
  migrations: { table: 'drizzle_migrations', schema: 'drizzle' },
});

// drizzle.config.libsql.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  driver: 'turso',
  schema: './packages/db/schema',
  out: './packages/db/migrations/libsql',
  dbCredentials: { url: process.env.DATABASE_URL!, authToken: process.env.TURSO_TOKEN },
});
```

### 6.3 命令

```bash
# 生成迁移
bunx drizzle-kit generate --config=drizzle.config.pg.ts
bunx drizzle-kit generate --config=drizzle.config.libsql.ts

# 自定义迁移（如 CREATE EXTENSION vector）
bunx drizzle-kit generate --custom --config=drizzle.config.pg.ts

# 执行
bunx drizzle-kit migrate --config=drizzle.config.pg.ts
bunx drizzle-kit migrate --config=drizzle.config.libsql.ts

# 可视化
bunx drizzle-kit studio
```

### 6.4 类型映射

| Domain Type | PostgreSQL（pg-core） | LibSQL/SQLite（sqlite-core） |
|-------------|----------------------|------------------------------|
| `text` | `text()` | `text()` |
| `int` | `integer()` | `integer()` |
| `bigint` | `bigint({ mode: 'number' })` | `integer({ mode: 'number' })` |
| `real` | `doublePrecision()` | `real()` |
| `bool` | `boolean()` | `integer({ mode: 'boolean' })` |
| `bytes` | `bytea()` | `blob({ mode: 'buffer' })` |
| `json` | `jsonb()` | `text({ mode: 'json' })` |
| `timestamptz` | `timestamp({ withTimezone: true })` | `text()` (ISO-8601, UTC) |
| `ulid` | `text()` | `text()` |
| `vector(N)` | `vector({ dimensions: N })` | `blob('embedding')` (`F32_BLOB(N)`，自定义迁移) |
| `array<T>` | `text().array()` | `text({ mode: 'json' })` |
| `enum` | `pgEnum(...)` | `text({ enum: [...] })` |

---

## 七、与 Mastra 生态互通

KeenAI 的 Memory / KB / Agent 用 Mastra 实现（见 09-11 号文档）。Mastra 自带 `MastraStorage` 与 `MastraVector` 接口，KeenAI 的 `Store` / `VectorStore` 通过 **轻量 Adapter** 输出 Mastra 兼容实现：

```ts
// packages/storage/src/mastra-adapter.ts
import type { Store, VectorStore } from './core/index.js';
import { LibSQLStore as MastraLibSQLStore, LibSQLVector } from '@mastra/libsql';
import { PostgresStore as MastraPgStore, PgVector } from '@mastra/pg';
import { Memory } from '@mastra/memory';

export function buildMastraMemory(store: Store, vector: VectorStore, embedder: string) {
  if (store.dialect === 'postgres') {
    return new Memory({
      storage: new MastraPgStore({ connectionString: getDsn(store) }),
      vector:  new PgVector({ connectionString: getDsn(store) }),
      embedder,
    });
  }
  // libsql / sqlite
  return new Memory({
    storage: new MastraLibSQLStore({ url: getLibSqlUrl(store) }),
    vector:  new LibSQLVector({ connectionString: getLibSqlUrl(store) }),
    embedder,
  });
}
```

这样 KeenAI 的业务层既能用自己的接口写「应用代码」（强解耦），又能在 Memory/KB 这种需要 Mastra 的地方一行接通。

---

## 八、配置示例

```yaml
# config/storage.yaml（被 c12 加载并支持环境变量覆盖）
storage:
  primary:
    driver: postgres                # postgres | libsql | sqlite
    dsn: ${env.DATABASE_URL}
    pool: { max: 50 }
  vector:
    driver: pgvector                # pgvector | libsql | sqlite-vec | qdrant
    index: { kind: hnsw, m: 16, efConstruction: 200, efSearch: 100 }
  fts:
    driver: postgres-tsvector       # postgres-tsvector | libsql-fts5 | meilisearch
    tokenizer: simple
    cjk: jieba                      # 应用层用 nodejieba 预切词
  pubsub:
    driver: postgres                # postgres | redis | in-memory
  cache:
    driver: redis
    url: ${env.REDIS_URL}
  object:
    driver: s3                      # s3 | minio | local
    bucket: keenai
    endpoint: ${env.S3_ENDPOINT}

# ─────────────────────────────────────────────────────
# 替代配置：Lite（适合 Indie / 自托管单机）
# ─────────────────────────────────────────────────────
# storage:
#   primary:
#     driver: libsql
#     dsn: "file:./data/keenai.db"
#     replica:
#       syncUrl: ${env.TURSO_URL}    # 可选：Embedded Replicas
#       authToken: ${env.TURSO_TOKEN}
#       syncInterval: 60
#   vector:
#     driver: libsql
#   fts:
#     driver: libsql-fts5
#     tokenizer: simple
#     cjk: jieba
#   pubsub:
#     driver: in-memory
#   cache:
#     driver: in-memory
#   object:
#     driver: local
#     path: ./data/files
```

---

## 九、能力对照表

| 能力 | PostgreSQL 实现 | LibSQL/SQLite 实现 |
|------|-----------------|-------------------|
| **关系数据 CRUD** | Drizzle + postgres-js | Drizzle + @libsql/client（或 better-sqlite3） |
| **事务** | `db.transaction()` | `db.transaction()`（SQLite SAVEPOINT 嵌套） |
| **嵌套事务** | SAVEPOINT | SAVEPOINT |
| **JSON 查询** | `jsonb` operators (`->`, `->>`, `@>`) | `json_extract`, `json_each` |
| **数组** | `text[]` | JSON 数组 + JSON1 函数 |
| **向量类型** | `vector(N)` / `halfvec(N)` / `sparsevec` | `F32_BLOB(N)`（LibSQL）/ `vec0(float[N])`（sqlite-vec） |
| **向量索引** | HNSW / IVFFlat | LibSQL HNSW（`libsql_vector_idx`）/ vec0 partition key |
| **向量过滤** | `WHERE meta = X ORDER BY embedding <=> ?` | LibSQL `vector_top_k(...) JOIN ... WHERE ...` |
| **全文索引** | `tsvector + GIN` | `FTS5` 虚拟表 |
| **中文分词** | zhparser 扩展 / 应用层 nodejieba | 应用层 nodejieba 预分词 |
| **Hybrid Search** | 单 SQL RRF（推荐）/ 应用层 RRF | 应用层并行 + RRF |
| **多租户** | `WHERE org_id =` + 分区表 | `WHERE org_id =` / partition key |
| **Pub/Sub** | LISTEN / NOTIFY | InMemory / Redis（推荐） |
| **行级安全** | RLS 策略 | 应用层强制 |
| **复制 / HA** | Patroni / 物理复制 | LibSQL Embedded Replicas / Litestream |
| **备份** | pg_dump / WAL-G | Litestream / `VACUUM INTO` |
| **最大向量数** | 千万级 | 百万级（LibSQL HNSW）/ 百万级（sqlite-vec） |
| **并发写** | 高 | 1 writer + N readers（足够 1000 DAU） |

---

## 十、限制与升级路径

### 10.1 SQLite/LibSQL 不适合场景

| 场景 | 临界点 | 升级建议 |
|------|--------|----------|
| 总数据 > 100GB | 单文件管理变难 | → PG |
| 并发写 QPS > 500 | WAL 锁瓶颈 | → PG |
| 向量 > 5M | sqlite-vec 全表扫慢 | → PG + pgvector HNSW 或 Qdrant |
| 多区域部署 | 需要逻辑复制 | → PG + 物理复制；或 Turso |
| 复杂分析 (OLAP) | SQLite 优化器弱 | → PG 或 DuckDB |

### 10.2 一键迁移工具

```bash
# bunx keenai migrate-backend --from libsql --to postgres
#   1. 读取源数据库 schema 与全量数据
#   2. 创建目标 schema（drizzle-kit）
#   3. 流式迁移所有表（pipeline writableStream）
#   4. 重建向量索引（HNSW）
#   5. 校验记录数 + 抽样检索准确性
bunx keenai migrate-backend \
  --from "libsql:./data/keenai.db" \
  --to   "postgres://keenai:secret@localhost:5432/keenai" \
  --batch 1000 \
  --verify-vectors
```

---

## 十一、性能基准（预期）

| 操作 | PG (pgvector HNSW) | LibSQL (libsql_vector HNSW) | better-sqlite3 + sqlite-vec |
|------|--------------------|------------------------------|------------------------------|
| 单条 INSERT | < 2ms | < 1ms | < 1ms |
| 批量 1000 条 INSERT | ~50ms | ~30ms | ~30ms |
| 向量检索 Top-10 (1M vec) | < 30ms | < 50ms | < 80ms |
| 向量检索 Top-10 (10M vec) | < 60ms | 不推荐 | 不推荐 |
| FTS Top-10 (1M doc) | < 20ms | < 15ms | < 15ms |
| Hybrid Search Top-10 | < 80ms | < 100ms | < 100ms |
| 启动时间 | 数秒（postgres process） | < 100ms | < 100ms |
| 进程内存 | PG ~200MB | < 100MB | < 100MB |
| 部署体积 | PG 镜像 ~400MB | Bun 二进制 + .db | 同左 |

---

## 十二、代码结构

```
packages/storage/
├── package.json                # @keenai/storage
├── src/
│   ├── index.ts                # public exports
│   ├── core/
│   │   ├── store.ts            # Store 接口
│   │   ├── vector.ts           # VectorStore 接口
│   │   ├── fts.ts              # FTSStore 接口
│   │   ├── expr.ts             # Expr DSL + factory
│   │   ├── object.ts           # ObjectStore 接口
│   │   └── types.ts
│   ├── hybrid.ts               # 通用 hybridSearch（RRF）
│   ├── factory.ts              # createStore(config) → 自动选 driver
│   ├── postgres/
│   │   ├── store.ts            # postgres-js + drizzle + LISTEN/NOTIFY
│   │   ├── vector.ts           # pgvector
│   │   ├── fts.ts              # tsvector + GIN
│   │   ├── expr.ts             # Expr → PG WHERE 翻译
│   │   └── hybrid.ts           # PG 单 SQL RRF
│   ├── libsql/
│   │   ├── store.ts            # @libsql/client + drizzle + InMemoryPubSub
│   │   ├── vector.ts           # libsql_vector 内置
│   │   ├── fts.ts              # FTS5
│   │   └── expr.ts             # Expr → SQLite WHERE
│   ├── sqlite/                 # 兜底实现
│   │   ├── store.ts            # better-sqlite3 + drizzle
│   │   ├── vector.ts           # sqlite-vec (vec0)
│   │   └── fts.ts              # FTS5
│   ├── object/
│   │   ├── s3.ts               # @aws-sdk/client-s3
│   │   ├── minio.ts
│   │   └── local.ts            # fs
│   ├── pubsub/
│   │   ├── in-memory.ts
│   │   ├── redis.ts            # ioredis pub/sub
│   │   └── pg-notify.ts
│   └── mastra-adapter.ts       # 输出 Mastra 兼容 Storage/Vector
├── tests/
│   ├── contract/               # 契约测试（跑所有 backend）
│   │   ├── store.contract.test.ts
│   │   ├── vector.contract.test.ts
│   │   ├── fts.contract.test.ts
│   │   └── hybrid.contract.test.ts
│   └── perf/                   # 基准
└── vitest.config.ts
```

---

## 十三、契约测试（关键）

为保证两个后端行为一致，所有接口测试 **同时跑** PG 与 LibSQL / SQLite：

```ts
// packages/storage/tests/contract/store.contract.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PostgresStore } from '../../src/postgres/store.js';
import { LibSQLStore } from '../../src/libsql/store.js';
import { BetterSqliteStore } from '../../src/sqlite/store.js';
import type { Store } from '../../src/core/store.js';

const backends: Array<{ name: string; build: () => Promise<Store> }> = [
  { name: 'postgres', build: () => new PostgresStore(process.env.PG_DSN!) },
  { name: 'libsql',   build: () => new LibSQLStore('file::memory:?cache=shared') },
  { name: 'sqlite',   build: () => new BetterSqliteStore(':memory:') },
];

describe.each(backends)('Store contract: $name', ({ build }) => {
  let store: Store;
  beforeEach(async () => { store = await build(); await runMigrations(store); });
  afterEach(async () => { await store.close(); });

  test('CRUD basic', async () => { /* ... */ });
  test('transactions', async () => { /* ... */ });
  test('savepoint rollback', async () => { /* ... */ });
  test('json queries', async () => { /* ... */ });
  test('listen / notify', async () => { /* ... */ });
});
```

类似地为 `VectorStore` / `FTSStore` / `HybridSearch` 编写契约测试。

CI 矩阵：

- ✅ `linux-amd64 + postgres-16 (pgvector/pgvector:pg16)`
- ✅ `linux-amd64 + libsql (file)`
- ✅ `linux-amd64 + better-sqlite3 + sqlite-vec`
- ✅ `linux-arm64 + libsql`
- ✅ `darwin-arm64 + libsql + better-sqlite3`
- ✅ `cloudflare-workers + drizzle/d1`（Edge 子集）

---

## 十四、与上层模块的关系

| 上层 | 用到的接口 | 备注 |
|------|-----------|------|
| **Conversation / Inbox / Ticket** | `Store` | 纯关系数据 |
| **Workflow** | `Store` + `Listen/Notify` + Inngest | 触发通知 |
| **Agent / Skill 状态** | `Store` + Redis 缓存 | |
| **[Memory System](10-AGENT-MEMORY.md)** | `Store` + `VectorStore` + `FTSStore` + `hybridSearch` | 完全基于抽象；同时通过 `mastra-adapter` 桥接 `@mastra/memory` |
| **[KB / RAG](11-RAG-KNOWLEDGE.md)** | `Store` + `VectorStore` + `FTSStore` + `hybridSearch` | 完全基于抽象 |
| **Audit Log** | `Store`（按月分区 / SQLite 按表轮转） | |
| **Object 存储** | `ObjectStore`（S3 / MinIO / Local） | 附件等 |

---

## 十五、Day-1 vs Day-100 配置

### 15.1 Day-1（开箱即用 · Indie / Demo）

```yaml
storage:
  primary: { driver: libsql, dsn: 'file:./data/keenai.db' }
  vector:  { driver: libsql }
  fts:     { driver: libsql-fts5, cjk: jieba }
  pubsub:  { driver: in-memory }
  cache:   { driver: in-memory }
  object:  { driver: local, path: ./data/files }

# 整个系统：1 个 Bun 二进制 + 1 个 .db 文件
# 容量：50K 客户、500K 对话、2M 向量
# 部署：bun run start  /  docker run -v ./data:/data keenai
```

### 15.2 Day-100（生产规模 · SaaS）

```yaml
storage:
  primary:
    driver: postgres
    dsn: ${env.DATABASE_URL}
    pool: { max: 100 }
    readReplicas: ['${env.PG_REPLICA_1}', '${env.PG_REPLICA_2}']
  vector:
    driver: pgvector
    index: { kind: hnsw, m: 32, efConstruction: 400 }
  fts:
    driver: meilisearch
    url:    ${env.MEILI_URL}
    apiKey: ${env.MEILI_KEY}
  pubsub:
    driver: redis
    url:    ${env.REDIS_URL}
  cache:
    driver: redis
    url:    ${env.REDIS_URL}
  object:
    driver: s3
    bucket: keenai-prod
    region: us-east-1
```

迁移过程：`bunx keenai migrate-backend --from libsql --to postgres`（约 10 分钟 / 百万级）。

---

## 十六、相关参考

| 来源 | 用途 |
|------|------|
| [Drizzle ORM](https://orm.drizzle.team/) · [drizzle-kit](https://orm.drizzle.team/docs/kit-overview) | TypeScript-first ORM + Migration（PG/SQLite/LibSQL/D1 同源） |
| [pgvector](https://github.com/pgvector/pgvector) · [pgvector npm](https://www.npmjs.com/package/pgvector) | PG 向量 |
| [LibSQL](https://github.com/tursodatabase/libsql) · [@libsql/client](https://www.npmjs.com/package/@libsql/client) | SQLite fork（含向量 / HTTP API / Embedded Replicas） |
| [sqlite-vec](https://github.com/asg017/sqlite-vec) | SQLite 向量扩展（兜底） |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Node.js 同步 SQLite |
| [Litestream](https://litestream.io/) | SQLite 实时备份 / HA |
| [Mastra Storage 文档](https://mastra.ai/docs/reference/storage) | Memory/Agent 存储适配 |
| [Hono](https://hono.dev/) | 跨 runtime HTTP 框架 |
| [postgres-js](https://github.com/porsager/postgres) | PG driver（Drizzle 首推） |
| [ioredis](https://github.com/redis/ioredis) | Redis 客户端（pub/sub） |
| [nodejieba](https://github.com/yanyiwu/nodejieba) | Node 中文分词 |
