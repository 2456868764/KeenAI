# KeenAI RAG / 知识库设计（TypeScript · Mastra RAG）

> **设计参考**：AgentMemory 的三流检索 + RRF Fusion + 4-tier Memory；Hermes Agent 的 Skill / MCP 集成；Anthropic Contextual Retrieval；LlamaIndex 父子分层；RAGAS / DeepEval 评估范式。
> **落地框架**：[`@mastra/rag`](https://mastra.ai/docs/rag) （`MDocument` chunker、embed、graphRAG）+ [Vercel AI SDK v4](https://sdk.vercel.ai/) （embed / rerank / generateObject）+ [`@keenai/storage`](12-STORAGE-ABSTRACTION.md)（双后端 VectorStore / FTSStore）。

---

## 一、设计目标

KeenAI Knowledge Base（KB）是 **集体性、长期、可版本化** 的产品知识源，与 [Memory（个体性、易变）](10-AGENT-MEMORY.md) 互补。

### 1.1 核心能力

| 能力 | 说明 |
|------|------|
| **多源摄入** | Help Center / 文档 / 网页 / Notion / GitHub / Slack / 对话沉淀 |
| **智能切片** | 语义切片 + 滑动窗口 + 层级保留（Mastra `MDocument`） |
| **多模态** | 文本 / 图片 / 视频字幕 / 代码 / 表格 |
| **混合检索** | BM25 + Vector + Knowledge Graph + RRF Fusion |
| **重排** | bge-reranker (`@xenova/transformers`) / Cohere Rerank / Jina（可选） |
| **上下文增强检索** | Anthropic Contextual Retrieval：为每个 chunk 加摘要前缀（Vercel AI SDK + prompt caching） |
| **多语言** | 中英日韩等 10+ 语言、跨语言检索 |
| **多租户隔离** | per-Brand 索引 + 全局公共 |
| **版本化** | Git 风格快照 + 回滚 |
| **新鲜度** | 自动检测过期 + 重建 |
| **可解释** | 引用来源 + Chunk 高亮 |
| **可评估** | 内置 Eval Harness（Mastra Eval / DeepEval-TS） |

### 1.2 KB vs Memory 协同

```
        ┌─────────────────────────────────────────┐
        │      Agent Context Assembler            │
        └─────────────────────────────────────────┘
              │                       │
              ▼                       ▼
       ┌──────────────┐        ┌──────────────┐
       │   Memory     │        │   Knowledge  │
       │              │        │     Base     │
       │  - 人物画像   │        │              │
       │  - 偏好历史   │        │  - 产品文档   │
       │  - 过往对话   │        │  - 操作指南   │
       │  - 行为模式   │        │  - 公司政策   │
       │              │        │  - FAQ        │
       │  per Customer│        │  per Brand    │
       │  Confidence  │        │  Versioned    │
       │  Decays      │        │  Long-lived   │
       │              │        │              │
       │ @mastra/     │        │ @mastra/rag  │
       │  memory      │        │ + @keenai/kb │
       └──────────────┘        └──────────────┘
```

---

## 二、架构总览

```
                        摄入侧 Ingestion
┌──────────────────────────────────────────────────────────────┐
│  Source Connectors (TS, Zod-typed)                            │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐    │
│  │HelpCtr │Notion  │ Web    │Conflu- │GitHub  │Manual  │    │
│  │ (内部) │(@notion│ Crawl  │ ence   │(@octo- │Upload  │    │
│  │        │ hq/    │(crawlee│        │ kit)   │        │    │
│  │        │ client)│ +Play-│        │        │        │    │
│  │        │        │ wright)│        │        │        │    │
│  └────────┴────────┴────────┴────────┴────────┴────────┘    │
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Ingestion Pipeline (Inngest steps)                   │    │
│  │  Fetch → Parse → Clean → Chunk → Enrich → Embed →    │    │
│  │  Index                                                │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                              ↓
            ┌─────────────────┴────────────────┐
            ▼                                  ▼
   ┌────────────────┐                ┌────────────────┐
   │  Document      │                │  Knowledge     │
   │  Store         │                │  Graph         │
   │  (Drizzle PG/  │                │  (Drizzle      │
   │  LibSQL)       │                │   relations)   │
   └────────┬───────┘                └────────┬───────┘
            │                                  │
            └──────────────┬──────────────────┘
                           ▼
              ┌─────────────────────────┐
              │   Triple Index           │
              │  ┌────────┬────────┐    │
              │  │ FTS    │ Vector │    │
              │  │Store   │ Store  │    │
              │  │(BM25)  │ (HNSW) │    │
              │  └────────┴────────┘    │
              └─────────────────────────┘

                           ↑
                       检索侧 Retrieval
              ┌─────────────────────────┐
              │   Hybrid Retriever       │
              │   (@keenai/kb)           │
              │                          │
              │  Stream Routing          │
              │  ├─ BM25 Top-N           │
              │  ├─ Vector Top-N         │
              │  └─ Graph Walk           │
              │                          │
              │  Fusion (RRF)            │
              │  Rerank (bge / Cohere)   │
              │  Diversify               │
              │  Filter by Tenant        │
              └────────────┬────────────┘
                           ▼
              ┌─────────────────────────┐
              │  Context Assembler       │
              │  - Token Budget          │
              │  - Citation Injection    │
              │  - Recency / Confidence  │
              └─────────────────────────┘
                           ▼
                  Agent / LLM Generation
                           ↓
                  Answer + Source Citation
                           ↓
                  Eval Loop（CSAT + click-through）
```

---

## 三、数据源（Source Connectors）

### 3.1 内置连接器

| Source | 同步方式 | 实现包 | 优先级 |
|--------|----------|--------|--------|
| **Help Center 文章** | 内部直接读 | Drizzle | P0 |
| **Past Conversations**（已解决） | 内部直接读 | Drizzle | P0 |
| **Feedback Posts** | 内部直接读 | Drizzle | P0 |
| **Changelog Entries** | 内部直接读 | Drizzle | P0 |
| **Roadmap Items** | 内部直接读 | Drizzle | P1 |
| **手动上传** PDF / Word / MD / TXT | Web UI + S3 | `unpdf` / `mammoth` / `marked` | P0 |
| **网页爬取** | scheduled | [`crawlee`](https://crawlee.dev/) + Playwright | P0 |
| **Notion** | OAuth + Webhook | `@notionhq/client` | P1 |
| **Confluence** | API Token | `confluence.js` | P1 |
| **GitHub Issues / Wiki / READMEs** | OAuth App + Webhook | `@octokit/rest` | P1 |
| **Google Drive** | OAuth | `googleapis` | P2 |
| **Slack channels** | OAuth + Events API | `@slack/bolt` | P2 |
| **Discord channels** | Bot Token | `discord.js` | P2 |
| **Linear Issues** | OAuth + Webhook | `@linear/sdk` | P2 |
| **Jira Issues** | OAuth + Webhook | `jira.js` | P2 |
| **YouTube 视频字幕** | API | `youtubei.js` / `youtube-transcript` | P3 |
| **PostgreSQL / MySQL 表** | Periodic | `postgres-js` / `mysql2` | P3 |

### 3.2 Connector 接口（Zod-typed）

```ts
// packages/kb/src/sources/types.ts
import { z } from 'zod';

export const Permissions = z.object({
  visibility: z.enum(['public', 'customers', 'paying_customers', 'internal', 'role']),
  roles:      z.array(z.string()).optional(),
});

export const Attachment = z.object({
  filename: z.string(),
  mime:     z.string(),
  url:      z.string(),               // S3 URL
  bytes:    z.number(),
});

export const KbDocument = z.object({
  id:           z.string(),
  source:       z.string(),
  externalId:   z.string().optional(),
  url:          z.string().url().optional(),
  title:        z.string(),
  content:      z.string(),
  contentType:  z.enum(['markdown', 'html', 'pdf', 'docx', 'txt', 'plain']),
  locale:       z.string().optional(),
  metadata:     z.record(z.unknown()).default({}),
  attachments:  z.array(Attachment).default([]),
  permissions:  Permissions,
  updatedAt:    z.string().datetime(),
});
export type KbDocument = z.infer<typeof KbDocument>;

export const ResourceRef = z.object({
  externalId: z.string(),
  updatedAt:  z.string().datetime(),
  etag:       z.string().optional(),
});

export interface Connector {
  readonly name: string;
  readonly type: ConnectorType;
  configSchema(): z.ZodTypeAny;

  /** 仅返回元信息（用于增量判断） */
  list(opts: { since?: Date }): Promise<ResourceRef[]>;
  /** 拉取完整文档 */
  fetch(ref: ResourceRef): Promise<KbDocument>;
  /** Webhook 模式：注册后由源系统推送事件 */
  subscribe?(handler: (events: ResourceRef[]) => Promise<void>): Promise<() => void>;
  healthCheck(): Promise<boolean>;
}

export type ConnectorType =
  | 'help_center' | 'past_conversations' | 'feedback' | 'changelog'
  | 'file_upload' | 'web_crawl'
  | 'notion' | 'confluence' | 'github' | 'slack' | 'discord'
  | 'linear' | 'jira' | 'google_drive' | 'youtube' | 'sql';
```

---

## 四、摄入流水线（Ingestion Pipeline）

```
┌───────────────────────────────────────────────────────────────┐
│  1. Fetch & Cache（拉取 + 本地缓存）                            │
│       - 增量同步（基于 ETag / updated_at）                      │
│       - 哈希去重（SHA-256）                                     │
├───────────────────────────────────────────────────────────────┤
│  2. Parse（解析）                                               │
│       - PDF → unpdf                                            │
│       - DOCX → mammoth                                          │
│       - HTML → cheerio + @mozilla/readability                  │
│       - MD → marked / remark + remark-gfm                       │
│       - 图片 → @paddleocr/paddleocr-js / tesseract.js           │
│       - 视频 → openai whisper api / faster-whisper（外置）       │
├───────────────────────────────────────────────────────────────┤
│  3. Clean（清洗）                                                │
│       - 去除导航 / 页脚 / 广告（@mozilla/readability）           │
│       - sanitize-html                                           │
│       - 规范化空白 / 标点                                        │
│       - 修复 Markdown 嵌套                                       │
│       - 提取标题层级                                             │
├───────────────────────────────────────────────────────────────┤
│  4. Chunk（切片 · Mastra MDocument）                             │
│       - 主策略：semantic（基于标题层级）                          │
│       - 备策略：recursive（512 tok，overlap 64）                  │
│       - 代码块：preserveCode: true                               │
│       - 表格：preserveTable: true                                │
│       - 列表：尽量不切断                                         │
├───────────────────────────────────────────────────────────────┤
│  5. Enrich（增强）                                               │
│       - Contextual Retrieval（Anthropic）：                      │
│         为每个 chunk 加 50-100 字摘要前缀                       │
│       - 关键词抽取（KeyBERT.ts / LLM）                           │
│       - 实体抽取 → 知识图谱（generateObject）                    │
│       - 翻译（多语言索引）                                       │
├───────────────────────────────────────────────────────────────┤
│  6. Embed（嵌入）                                                │
│       - 默认：@xenova/transformers bge-m3（本地、免费）          │
│       - 备选：openai('text-embedding-3-small') / voyage / cohere │
│       - 批量并行（p-limit concurrency=4）                         │
├───────────────────────────────────────────────────────────────┤
│  7. Index（索引）                                                │
│       - 写 FTSStore（BM25）—— PG: tsvector / LibSQL: FTS5 / Meili │
│       - 写 VectorStore —— PG: pgvector HNSW / LibSQL: libsql_vec  │
│       - 更新 Knowledge Graph                                     │
├───────────────────────────────────────────────────────────────┤
│  8. Notify（通知）                                               │
│       - 触发 Inngest 事件 `kb/document.indexed`                  │
│       - 失效相关缓存（lru-cache + ioredis invalidate）            │
│       - 触发依赖此 Doc 的 Agent 重新评估                         │
└───────────────────────────────────────────────────────────────┘
```

### 4.1 切片策略详解

#### A. 语义切片（首选 · Mastra MDocument）

```ts
import { MDocument } from '@mastra/rag';

const doc = MDocument.fromMarkdown(rawMarkdown, { metadata: { sourceId } });

const chunks = await doc.chunk({
  strategy: 'markdown',                // 基于 H1/H2/H3 切分
  size:     512,
  overlap:  64,
  preserveHeaders: true,
});
```

#### B. 父子结构（Hierarchical Chunking）

```
Parent: 整篇文章（用于 BM25 匹配 + 上下文展示）
  ├─ Section: H2 级小节（用于 Vector 检索）
  │   ├─ Chunk: 段落级（用于细粒度引用）
  │   └─ Chunk: ...
  └─ Section: ...
```

检索时：先 Chunk 级 Vector → 找到 Section → 父 Section 补充上下文 → 完整 Parent 用于引用展示。

实现：每条 `kb_chunks.parentChunkId` 指向 Section，Section 的 `parentChunkId` 指向 Parent。

#### C. Contextual Retrieval（Anthropic 风格）

```ts
// packages/kb/src/ingest/contextual.ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const CTX_PROMPT = `Here is a document:
<document>
{{document}}
</document>

Here is the chunk we want to situate within the document:
<chunk>
{{chunk}}
</chunk>

Please give a short succinct context (50-100 chars) to situate this chunk within
the overall document for the purposes of improving search retrieval.
Answer only with the succinct context.`;

export async function addContext(fullDoc: string, chunks: string[]) {
  return Promise.all(chunks.map(async (chunk) => {
    const { text } = await generateText({
      model: anthropic('claude-haiku-5'),
      messages: [{
        role: 'user',
        content: [
          // Anthropic prompt caching — 完整文档只算一次
          { type: 'text', text: CTX_PROMPT.split('{{document}}')[0]! },
          { type: 'text', text: fullDoc,
            experimental_providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } } },
          { type: 'text',
            text: CTX_PROMPT.split('{{document}}')[1]!.replace('{{chunk}}', chunk) },
        ],
      }],
    });
    return `${text}\n\n${chunk}`;
  }));
}
```

**效果**：召回率提升 35%+（Anthropic 报告）。

### 4.2 Inngest Pipeline 实现

```ts
// apps/worker/src/jobs/kb-ingest.ts
import { inngest } from '@keenai/workflow/inngest';
import { fetchDocument, parse, clean, chunk, enrich, embed, index } from '@keenai/kb/pipeline';

export const kbIngest = inngest.createFunction(
  { id: 'kb-ingest-document', retries: 3, concurrency: { limit: 8, key: 'event.data.brandId' } },
  { event: 'kb/document.fetch' },
  async ({ event, step }) => {
    const { sourceId, externalRef } = event.data;

    const raw      = await step.run('fetch',  () => fetchDocument(sourceId, externalRef));
    const parsed   = await step.run('parse',  () => parse(raw));
    const cleaned  = await step.run('clean',  () => clean(parsed));
    const chunks   = await step.run('chunk',  () => chunk(cleaned));
    const enriched = await step.run('enrich', () => enrich(chunks, cleaned));
    const embedded = await step.run('embed',  () => embed(enriched));
    await step.run('index', () => index(embedded));
    await step.sendEvent('kb-indexed', { name: 'kb/document.indexed', data: { sourceId, count: chunks.length } });
  },
);
```

---

## 五、混合检索（Hybrid Retrieval）

完全对应 [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md) 中的三流检索，但用于 KB 文档：

### 5.1 三流检索器接口

```ts
// packages/kb/src/retriever/types.ts
import { z } from 'zod';
import type { VectorStore, FTSStore, Store, Expr } from '@keenai/storage';

export const KbQuery = z.object({
  orgId:       z.string(),
  brandId:     z.string(),
  queryText:   z.string(),
  filters:     z.record(z.unknown()).default({}),         // tags / locale / source
  topK:        z.number().int().min(1).max(50).default(10),
  minScore:    z.number().min(0).max(1).default(0.3),
  rerank:      z.boolean().default(true),
});
export type KbQuery = z.infer<typeof KbQuery>;

export interface ScoredChunk {
  id:        string;
  content:   string;
  contextPrefix?: string;
  score:     number;
  metadata:  Record<string, unknown>;
  source: {
    bm25?:   number;
    vector?: number;
    graph?:  number;
  };
}

export interface RetrievalResult {
  chunks: ScoredChunk[];
  latencyMs: Record<string, number>;
}

export interface HybridRetriever {
  retrieve(query: KbQuery): Promise<RetrievalResult>;
}
```

### 5.2 Hybrid Retriever 实现

```ts
// packages/kb/src/retriever/hybrid.ts
import type { HybridRetriever, KbQuery, RetrievalResult, ScoredChunk } from './types.js';
import type { VectorStore, FTSStore, Store } from '@keenai/storage';
import { rrfFuse, diversify, applyRecency } from './fuse.js';
import { rerankWithBge } from './rerank.js';
import { graphWalk } from './graph.js';
import { embedQuery } from '../embed.js';

export class DefaultHybridRetriever implements HybridRetriever {
  constructor(
    private store:   Store,
    private vector:  VectorStore,
    private fts:     FTSStore,
    private weights = { bm25: 0.4, vector: 0.5, graph: 0.1 },
  ) {}

  async retrieve(q: KbQuery): Promise<RetrievalResult> {
    const t0 = performance.now();
    const queryVec = await embedQuery(q.queryText);
    const partition = { org_id: q.orgId, brand_id: q.brandId };

    const [bm25Res, vecRes, graphRes] = await Promise.all([
      this.fts.search({
        index: 'fts_kb_chunks', query: q.queryText, filter: q.filters,
        limit: 30,
      }),
      this.vector.search({
        collection: 'kb_chunks', queryVector: queryVec, topK: 30,
        partitionFilter: partition, metadataFilter: q.filters,
        includeMetadata: true,
      }),
      graphWalk(this.store, q.orgId, q.brandId, q.queryText, 20),
    ]);

    const fused = rrfFuse(
      [
        { name: 'bm25',   hits: bm25Res.hits },
        { name: 'vector', hits: vecRes.hits },
        { name: 'graph',  hits: graphRes },
      ],
      this.weights,
    );

    const filtered  = fused.filter((h) => h.score >= q.minScore);
    const reranked  = q.rerank ? await rerankWithBge(q.queryText, filtered) : filtered;
    const recencied = reranked.map((h) => applyRecency(h));
    const diverse   = diversify(recencied, 2, 1);
    const final     = diverse.slice(0, q.topK) as ScoredChunk[];

    return {
      chunks: final,
      latencyMs: {
        total:  performance.now() - t0,
        bm25:   bm25Res.latencyMs,
        vector: vecRes.latencyMs,
      },
    };
  }
}
```

### 5.3 RRF Fusion（加权）

```ts
// packages/kb/src/retriever/fuse.ts
export interface RankedSource { name: string; hits: { id: string; metadata?: any }[] }

export function rrfFuse(
  sources: RankedSource[],
  weights: Record<string, number>,
  k = 60,
): ScoredChunk[] {
  const scores = new Map<string, ScoredChunk>();
  for (const { name, hits } of sources) {
    const w = weights[name] ?? 1.0;
    hits.forEach((h, rank) => {
      const prev = scores.get(h.id);
      const inc  = w / (k + rank);
      const merged: ScoredChunk = prev
        ? { ...prev, score: prev.score + inc, source: { ...prev.source, [name]: 1 / (k + rank) } }
        : { id: h.id, content: '', metadata: h.metadata ?? {}, score: inc, source: { [name]: 1 / (k + rank) } };
      scores.set(h.id, merged);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score);
}
```

### 5.4 Reranker（重排）

```ts
// packages/kb/src/retriever/rerank.ts
import { pipeline } from '@xenova/transformers';
import type { ScoredChunk } from './types.js';

let rerankerPromise: Promise<any> | null = null;
const loadReranker = () => rerankerPromise ??=
  pipeline('text-classification', 'Xenova/bge-reranker-v2-m3');

export async function rerankWithBge(query: string, chunks: ScoredChunk[]) {
  const r = await loadReranker();
  const scored = await Promise.all(chunks.map(async (c) => {
    const out = await r(`${query} [SEP] ${c.content}`);
    return { ...c, score: out[0].score };
  }));
  return scored.sort((a, b) => b.score - a.score);
}
```

可替代实现：
- **Cohere Rerank**：`cohere-ai` SDK，调用 `rerank-multilingual-v3.0`
- **Jina Rerank**：HTTP API
- **LLM Reranker**：`generateObject` + 小模型评分（慢但灵活）

### 5.5 多样性约束

```ts
// packages/kb/src/retriever/diversify.ts
export function diversify<T extends { metadata: any }>(
  hits: T[], maxPerSource = 2, maxPerSection = 1,
): T[] {
  const bySource  = new Map<string, number>();
  const bySection = new Map<string, number>();
  return hits.filter((h) => {
    const s  = h.metadata.sourceId  as string;
    const sc = h.metadata.sectionId as string;
    if ((bySource.get(s)  ?? 0) >= maxPerSource)  return false;
    if ((bySection.get(sc) ?? 0) >= maxPerSection) return false;
    bySource.set(s,  (bySource.get(s)  ?? 0) + 1);
    bySection.set(sc, (bySection.get(sc) ?? 0) + 1);
    return true;
  });
}
```

### 5.6 检索流程完整时序

```
查询: "怎么导出数据"
   │
   ├─ Embed Query (@xenova/transformers bge-m3) →  [0.21, -0.45, ...]
   │
   ├─ Parallel:
   │    ├─ FTSStore.search (BM25) → 30 候选 chunks
   │    ├─ VectorStore.search (HNSW) → 30 候选 chunks
   │    └─ graphWalk: "导出" entity → 找相关 entities → 关联 chunks → 20
   │
   ├─ RRF Fuse (k=60, weighted) → 60 unique chunks, scored
   │
   ├─ Filter: minScore + permission → 40 chunks
   │
   ├─ Rerank (bge-reranker, query vs top-40 chunks) → top-15
   │
   ├─ Apply Recency Boost → final order
   │
   ├─ Diversify (max 2 per source, 1 per section) → top-10
   │
   └─ Return: top-10 chunks + 父 Section + 元数据 + citations
```

---

## 六、Knowledge Graph（知识图谱）

### 6.1 实体类型

```ts
// packages/kb/src/graph/schema.ts
import { z } from 'zod';

export const EntityType = z.enum([
  'product', 'feature', 'role', 'plan', 'integration',
  'error', 'api_endpoint', 'concept',
]);

export const RelationType = z.enum([
  'depends_on', 'alternative_to', 'sub_feature_of',
  'available_in_plan', 'documented_in', 'related_to', 'deprecated_by',
]);

export const ExtractedKG = z.object({
  entities: z.array(z.object({
    type: EntityType,
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).default({}),
  })),
  relations: z.array(z.object({
    fromName: z.string(),
    type:     RelationType,
    toName:   z.string(),
    confidence: z.number().min(0).max(1),
  })),
});
```

### 6.2 KG 查询场景

**场景 1：用户问「Pro 计划有哪些功能？」**

```ts
// packages/kb/src/graph/query.ts
import { sql } from 'drizzle-orm';

export async function featuresInPlan(store: Store, brandId: string, plan: string) {
  return store.db.execute(sql.raw(`
    SELECT f.* FROM kb_entities f
    JOIN kb_relations r ON r.from_entity_id = f.id
    JOIN kb_entities  p ON r.to_entity_id   = p.id
    WHERE r.relation_type = 'available_in_plan'
      AND f.entity_type   = 'feature'
      AND p.entity_type   = 'plan'
      AND p.name          = '${plan}'
      AND f.brand_id      = '${brandId}'
  `));
}
```

**场景 2：用户问「Slack 集成怎么用？」**

```ts
export async function relatedChunks(store: Store, brandId: string, entityName: string) {
  // 1. 实体匹配 → 2. 找 documented_in / depends_on 关系 → 3. 返回 chunk_ids
  return store.db.execute(sql.raw(`
    WITH entity AS (
      SELECT id FROM kb_entities WHERE name = '${entityName}' AND brand_id = '${brandId}' LIMIT 1
    )
    SELECT DISTINCT unnest(e.chunk_ids) AS chunk_id
    FROM kb_entities e
    WHERE e.id IN (
      SELECT to_entity_id FROM kb_relations
      WHERE from_entity_id IN (SELECT id FROM entity)
        AND relation_type IN ('documented_in', 'depends_on')
    )
  `));
}
```

**场景 3：「报错 E001 怎么办？」** — 实体匹配 + `solution_for` 关系 → 直接定位答案。

> 也可使用 [`@mastra/rag` `graphRAG`](https://mastra.ai/docs/rag/graph-rag) 接管 KG 流，与 Mastra Memory 共享同一图谱实例。

---

## 七、多租户与权限

### 7.1 索引隔离（按后端）

| 后端 | 索引隔离策略 |
|------|--------------|
| **Meilisearch（外置 FTS）** | Index per Brand：`keenai_kb_{org_id}_{brand_id}`，可选全局 `keenai_kb_public` |
| **PG tsvector**（内置 FTS） | 共享 Table，`WHERE org_id = ? AND brand_id = ?` + 复合索引 |
| **LibSQL / SQLite FTS5**（内置） | 共享 Table，业务列 `org_id/brand_id` 作为 UNINDEXED 过滤列 |
| **pgvector**（PG 向量） | 共享 Table + `WHERE org_id = ? AND brand_id = ?`；HNSW 索引；过滤后 KNN |
| **LibSQL `libsql_vector`** | 同上：`WHERE org_id = ? AND brand_id = ?` 后 `vector_top_k` |
| **sqlite-vec**（兜底） | `vec0 partition key (org_id, brand_id)` 原生分片，零运行时开销 |
| **Qdrant / Milvus**（外置） | Collection per Brand 或共享 Collection + payload 过滤 |

> 业务代码经 `VectorStore.search({ partitionFilter: { org_id, brand_id }, ... })`，由 driver 自动选择最优策略。

### 7.2 Chunk 级权限（Drizzle）

```ts
// packages/db/schema/kb.ts
import { pgTable, text, integer, real, jsonb, timestamp, vector, index } from 'drizzle-orm/pg-core';

export const kbChunks = pgTable('kb_chunks', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  brandId:        text('brand_id'),
  documentId:     text('document_id').notNull(),
  parentChunkId:  text('parent_chunk_id'),         // Hierarchical
  sectionId:      text('section_id'),
  chunkIndex:     integer('chunk_index'),
  content:        text('content').notNull(),
  contextPrefix:  text('context_prefix'),          // Anthropic Contextual
  contentSize:    integer('content_size'),
  embedding:      vector('embedding', { dimensions: 1024 }),
  locale:         text('locale'),
  permissions:    jsonb('permissions'),            // { visibility, roles }
  confidence:     real('confidence').notNull().default(1.0),
  metadata:       jsonb('metadata'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  brandIdx:  index('idx_kb_chunks_brand').on(t.orgId, t.brandId),
  docIdx:    index('idx_kb_chunks_doc').on(t.documentId),
  localeIdx: index('idx_kb_chunks_locale').on(t.brandId, t.locale),
  // HNSW 索引：自定义迁移
  //   CREATE INDEX idx_kb_chunks_vector ON kb_chunks
  //     USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=200);
}));
```

### 7.3 权限模型

```ts
// packages/kb/src/permissions.ts
export type Visibility = 'public' | 'customers' | 'paying_customers' | 'internal' | 'role';
export interface Permissions { visibility: Visibility; roles?: string[] }

// Help Center 文章 → 通常 public
// 内部 SOP → internal
// 企业版功能 → paying_customers
```

---

## 八、新鲜度（Freshness）

### 8.1 过期检测规则

```yaml
# config/kb-freshness.yaml
freshness_rules:
  - source: help_center
    autoResync: on_update_webhook
    maxAge:    never
  - source: web_crawl
    autoResync: weekly
    maxAge:    30d
  - source: github_readme
    autoResync: on_push
    maxAge:    never
  - source: past_conversations
    autoResync: on_close
    maxAge:    90d         # 过老对话淡化权重
  - source: notion
    autoResync: daily
    maxAge:    never
```

### 8.2 失效传播

```
原文档变更（Webhook / cron 发现）
    ↓
Inngest 事件 kb/document.changed
    ↓
重新 Parse + Chunk（流水线复用）
    ↓
对比旧 chunks（content_hash diff）：
  - 新增 → 索引 + 嵌入
  - 修改 → 更新（保留 chunk_id 便于引用）
  - 删除 → 软删除（status=archived）
    ↓
ioredis 失效相关 Agent 缓存
    ↓
通知 Memory 中引用此 chunk 的记忆需要重新评估
```

---

## 九、版本与回滚

### 9.1 KB 快照（Drizzle）

```ts
// packages/db/schema/kb-snapshots.ts
export const kbSnapshots = pgTable('kb_snapshots', {
  id:            text('id').primaryKey(),
  orgId:         text('org_id').notNull(),
  brandId:       text('brand_id'),
  name:          text('name'),                // "Before Q2 重构"
  description:   text('description'),
  chunkCount:    integer('chunk_count'),
  snapshotPath:  text('snapshot_path'),       // S3 路径（dump）
  createdBy:     text('created_by'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 9.2 操作

- 创建快照（按需 / 每月自动 by Inngest cron）
- 查看历史版本
- 回滚到某个快照（管理员操作）
- 对比两个版本（diff）

---

## 十、Eval Harness（评估框架）

落地为 **Mastra Eval** + DeepEval-TS 双引擎：

```ts
// packages/kb/src/eval/runner.ts
import { evaluate } from '@mastra/evals';
import { AnswerRelevancyMetric, ContextPrecisionMetric, FaithfulnessMetric } from '@mastra/evals/llm';
import { ContextRelevancyMetric, ContextualRecallMetric } from '@mastra/evals/nlp';
import { goldenSet } from './golden.js';
import { hybridRetriever } from '@keenai/kb';
import { openai } from '@ai-sdk/openai';

const judge = openai('gpt-5-mini');

export async function runEvalSuite() {
  return Promise.all(goldenSet.map(async (q) => {
    const { chunks } = await hybridRetriever.retrieve({ /* ... */ });
    return {
      query: q.query,
      results: await evaluate({
        scorers: [
          new ContextPrecisionMetric(judge),
          new ContextualRecallMetric(judge),
          new AnswerRelevancyMetric(judge),
          new FaithfulnessMetric(judge),
        ],
        input: q.query,
        output: synthesize(chunks),
        context: chunks.map((c) => c.content),
        expectedOutput: q.expectedAnswer,
      }),
    };
  }));
}
```

```yaml
# config/kb-eval.yaml
evaluation_suite:
  datasets:
    - name:    "Top 100 FAQ"
      type:    hand_curated
      queries: 100
    - name:    "Historical resolved tickets"
      type:    auto_generated
      source:  past_conversations
      queries: 1000

  metrics:
    - recall_at_k:     [5, 10, 20]
    - mrr
    - ndcg
    - hit_rate
    - faithfulness                         # 答案与 chunks 一致性
    - answer_relevance                     # 答案与问题相关性
    - context_precision
    - context_recall
    - latency_p50_p95_p99

  runners:
    - mastra_eval                          # @mastra/evals
    - deepeval                             # deepeval-ts
    - custom                               # 自研 Vitest runner

  schedule:
    - on_release:    full_suite
    - daily:         smoke_tests (50 queries)
    - on_kb_change:  affected_queries
```

### 10.1 Dashboard

```
KB Eval Dashboard:
  - Recall@5 趋势图（按时间）
  - 每种 Source 的命中率
  - 失败 Query 列表（点击查看检索详情）
  - A/B 测试结果（new vs old retrieval config）
```

---

## 十一、Contextual Retrieval（详解）

参考 Anthropic 2024 年发布的 **Contextual Retrieval**：

### 11.1 标准 vs Contextual

```
标准 Chunking:
  chunk = "导出 CSV 时支持 GBK 编码"
  缺陷：脱离上下文，BM25/Vector 难匹配「数据导出问题」

Contextual Chunking:
  context = "本节描述 Acme 后台『数据管理』模块的『导出』功能。"
  enriched = context + "\n" + chunk

  优势：
  - 加入上下文后，BM25 能命中「数据管理 导出」
  - Vector 嵌入更准确
  - 用户引用时上下文清晰
```

### 11.2 Cache 优化

为每个 Document 生成 context 时会重复读取完整文档 → 用 LLM Prompt Caching（OpenAI / Anthropic 都支持）。Vercel AI SDK 已封装：

```ts
// 见 §4.1 C，使用 experimental_providerMetadata.anthropic.cacheControl
```

**成本**：~$1 / 百万 token 文档（一次性，效果可观）。

---

## 十二、多语言策略

### 12.1 跨语言检索

```yaml
cross_lingual:
  embedding: xenova:bge-m3                # 100+ 语言统一向量空间
  bm25:
    - 中文：nodejieba 应用层预分词
    - 日文：tiny-segmenter
    - 韩文：mecab-ko-msvc / k-tokenizer
    - 其他：unicode61 分词
  queryTranslation:
    enabled:        true
    targetLanguages: [zh, en]   # Query 同时翻译为 zh 和 en 各检索一次
    fuse:           rrf
```

### 12.2 多语言索引

```ts
// packages/db/schema/kb-documents.ts
export const kbDocuments = pgTable('kb_documents', {
  // ...
  canonicalLocale: text('canonical_locale'),
  translations:    jsonb('translations'),     // {"zh": {...}, "en": {...}}
});
```

---

## 十三、引用与可解释性（Citation）

### 13.1 引用格式

LLM 生成回答时，强制以下格式（system prompt）：

```
要导出数据为 CSV，请按以下步骤操作：
1. 进入「数据管理」模块
2. 点击「导出」按钮 [^1]
3. 选择 GBK 编码（如需中文兼容） [^2]

[^1]: Help Center > 数据管理 > 导出（更新于 2026-04-15）
[^2]: 已解决工单 #4521：客户报告 CSV 中文乱码
```

### 13.2 引用注入到 Prompt

```ts
const systemPrompt = `
You are Keeni AI Customer Support Agent.

When answering, ALWAYS cite sources using [^N] format,
where N corresponds to the chunk number below.

<knowledge>
${chunks.map((c, i) => `
[^${i + 1}] (${c.metadata.sourceType}, ${c.metadata.title}, updated ${c.metadata.updatedAt}):
${c.contextPrefix ? c.contextPrefix + '\n\n' : ''}${c.content}
`).join('\n')}
</knowledge>
`;
```

### 13.3 前端高亮（Dashboard / Widget）

- 用户点击 `[^1]` → Popover 弹出原文 chunk + 跳转链接
- Source 类型用图标区分（📚 Help Center / 💬 对话 / 📝 Changelog）
- 引用文档过期时显示「⚠️ 此文档 3 个月未更新」
- React 组件：`@keenai/ui` 提供 `<CitationPopover />`

---

## 十四、性能优化

| 优化 | 说明 |
|------|------|
| **Embedding 缓存** | `lru-cache` + `ioredis`：相同 Query 不重复嵌入 |
| **检索结果缓存** | 高频 Query 缓存 5min（注意失效） |
| **批量嵌入** | `p-limit(4)`，单次调用嵌入 100 chunks |
| **HNSW 调优** | `m=16, ef_construction=200`，召回 95% |
| **Index 预热** | 启动时加载常用 chunks 到内存 |
| **并行检索** | BM25 / Vector / Graph `Promise.all` |
| **Streaming Retrieval** | Hono SSE 边检索边返回首批结果 |
| **Reranker 量化** | `@xenova/transformers` int8 量化 |
| **冷启动加速** | 新 Brand 默认载入公共模板 KB |
| **Edge 缓存** | Cloudflare Workers 缓存只读检索（KV / D1） |

### 14.1 性能目标

| 指标 | 目标 |
|------|------|
| BM25 检索 P95 | < 30ms |
| Vector 检索 P95 | < 50ms（100 万 chunks） |
| Rerank P95 | < 100ms（top-30） |
| 总检索 P95 | < 200ms |
| 索引吞吐 | 1000 chunks/s（嵌入是瓶颈） |
| 单 Brand 容量 | 1M chunks |
| 单实例服务 | 100 QPS |

---

## 十五、KB 管理 UI（Dashboard）

```
Knowledge Base > Sources
┌──────────────────────────────────────────────────┐
│ Sources                       [+ Add Source]      │
├──────────────────────────────────────────────────┤
│ ✅ Help Center            156 articles   实时     │
│ ✅ Past Conversations     8,234 chats    实时     │
│ ✅ Feedback Posts         412 posts      实时     │
│ ✅ Changelog              87 entries     实时     │
│ ─────────────────────────────────────             │
│ Custom Sources                                     │
│ ⏳ product_manual.pdf    45 pages   2h ago      │
│ ✅ docs.example.com      128 pages  daily       │
│ ✅ Q&A: "How to cancel"   3 variants  manual    │
│ ⚠️ outdated_wiki         15 pages   30d stale   │
│ ❌ confluence_export     error: auth failed     │
└──────────────────────────────────────────────────┘

Knowledge Base > Search Playground
┌──────────────────────────────────────────────────┐
│ Query: [怎么导出数据                      ] 🔍   │
│ Filters: Brand [Main] Locale [zh] Source [All]   │
├──────────────────────────────────────────────────┤
│ Results (10 of 423, 87ms)                         │
│                                                   │
│ #1 (score: 0.94) Help Center > 数据管理 > 导出    │
│    [📚] "用户可在『数据管理』模块导出..."          │
│    BM25: 0.82 · Vector: 0.91 · Graph: 0.85       │
│    [View source] [Hide from KB] [Edit]            │
│                                                   │
│ #2 (score: 0.89) Solved Ticket #4521              │
│    [💬] "客户反馈 CSV 中文乱码，解决方案..."       │
│    BM25: 0.65 · Vector: 0.88 · Graph: 0.70       │
└──────────────────────────────────────────────────┘

Knowledge Base > Evaluation
┌──────────────────────────────────────────────────┐
│ Recall@5 Trend       Last 30 days    [Compare]    │
│ 95% ┤        ╭────                                │
│ 90% ┤    ╭───╯                                    │
│ 85% ┤────╯                                        │
│ Top Failed Queries                                │
│  - "如何取消订阅"           (3/5 retrieved)       │
│  - "API rate limit 是多少"  (2/5 retrieved)       │
│ [Run Full Eval] [Add to Golden Set]               │
└──────────────────────────────────────────────────┘
```

实现：Next.js 15 App Router + Shadcn/ui + TanStack Table。

---

## 十六、配置示例

```ts
// config/kb.config.ts
import { defineConfig } from 'c12';

export default defineConfig({
  kb: {
    defaultEmbedding: {
      provider:  'xenova',                  // 本地
      model:     'Xenova/bge-m3',
      dimension: 1024,
      batchSize: 32,
    },
    fallbackEmbedding: {
      provider:  'openai',
      model:     'text-embedding-3-small',
      dimension: 1536,
    },
    chunking: {
      strategy:           'markdown',       // markdown | recursive | sentence
      maxTokens:          512,
      minTokens:          100,
      overlapTokens:      64,
      preserveCodeBlocks: true,
      preserveTables:     true,
    },
    contextualRetrieval: {
      enabled:       true,
      provider:      'anthropic',
      model:         'claude-haiku-5',
      cacheDocuments: true,
    },
    retrieval: {
      topK:         20,
      rerank:       true,
      rerankTopK:   10,
      finalTopK:    5,
      minScore:     0.3,
      diversifier:  { maxPerSource: 2, maxPerSection: 1 },
      recencyBoost: { enabled: true, halfLifeDays: 90 },
      weights:      { bm25: 0.4, vector: 0.5, graph: 0.1 },
    },
    reranker: {
      provider: 'xenova',
      model:    'Xenova/bge-reranker-v2-m3',
    },
    knowledgeGraph: {
      enabled: true,
      entityExtraction: {
        provider: 'openai',
        model:    'gpt-5-mini',
      },
      autoLinkThreshold: 0.7,
    },
    freshness: {
      checkInterval:    '1h',
      autoRefresh:      true,
      staleWarningDays: 90,
    },
    evaluation: {
      enabled:        true,
      onRelease:      true,
      goldenSetPath:  './fixtures/kb-golden.jsonl',
    },
  },
});
```

---

## 十七、与其他模块协作

### 17.1 与 Memory 协作

```ts
// packages/agent/src/context/assembler.ts
export async function assembleContextForAgent(args: {
  customerId: string; query: string; orgId: string; brandId: string;
}) {
  const [kbResults, memoryResults, profile] = await Promise.all([
    kbService.search({ ...args, topK: 10 }),
    memoryService.search({ scope: 'customer', subjectId: args.customerId, query: args.query, topK: 5 }),
    memoryService.getProfile(args.customerId),
  ]);

  // 合并优先级：profile > memory > kb；避免冗余
  return new ContextBuilder({ tokenBudget: 4000 })
    .add('Customer Profile', profile,        { priority: 10 })
    .add('Past Memories',    memoryResults,  { priority:  8 })
    .add('Knowledge Base',   kbResults,      { priority:  5 })
    .build();
}
```

### 17.2 与 Skill 协作

```yaml
skill: refund-handler
context_query: "refund policy {{user.plan}}"
context_filters:
  source:      ["policy_documents"]
  visibility:  "internal"
top_k: 3
```

### 17.3 与 Workflow 协作（Inngest 步骤）

```ts
inngest.createFunction(
  { id: 'workflow-with-kb' },
  { event: 'workflow/triggered' },
  async ({ event, step }) => {
    const kbResults = await step.run('kb-search', () =>
      kbService.search({ queryText: event.data.message, topK: 5 }),
    );
    // 注入到 agent runtimeContext
    await step.run('let-keeni-answer', () => runAgent({ context: kbResults }));
  },
);
```

### 17.4 与对话沉淀闭环

```
对话关闭（已解决）
    ↓
Inngest 事件 conversation/closed
    ↓
Quality Filter（CSAT >= 4 OR 客服标记「典型案例」）
    ↓
LLM 重写为「问题 → 答案」FAQ 格式（generateObject）
    ↓
人工/AI 审核 → 进入「KB 候选池」
    ↓
管理员一键加入 Help Center
    ↓
自动索引到 KB → 下次同类问题命中
```

---

## 十八、数据模型完整 Schema（Drizzle）

> **双后端**：以下 PG 方言由 [Storage Abstraction Layer](12-STORAGE-ABSTRACTION.md) 的 Schema Factory 自动生成 SQLite/LibSQL 等价表。

```ts
// packages/db/schema/kb.ts
import { pgTable, text, integer, real, jsonb, timestamp, vector, index } from 'drizzle-orm/pg-core';

/* ──────── KB 文档源 ──────── */
export const kbSources = pgTable('kb_sources', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  brandId:        text('brand_id'),
  type:           text('type').notNull(),             // help_center/web/file/notion/...
  name:           text('name'),
  config:         jsonb('config'),
  secretsRef:     text('secrets_ref'),                // 凭证引用
  status:         text('status', { enum: ['active', 'syncing', 'error', 'disabled'] }),
  syncStrategy:   text('sync_strategy', { enum: ['realtime', 'scheduled', 'manual'] }),
  syncSchedule:   text('sync_schedule'),              // cron
  lastSyncedAt:   timestamp('last_synced_at', { withTimezone: true }),
  nextSyncAt:     timestamp('next_sync_at',  { withTimezone: true }),
  error:          text('error'),
  documentCount:  integer('document_count').notNull().default(0),
  chunkCount:     integer('chunk_count').notNull().default(0),
  createdBy:      text('created_by'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ──────── 文档 ──────── */
export const kbDocuments = pgTable('kb_documents', {
  id:               text('id').primaryKey(),
  orgId:            text('org_id').notNull(),
  brandId:          text('brand_id'),
  sourceId:         text('source_id').notNull().references(() => kbSources.id),
  externalId:       text('external_id'),
  title:            text('title').notNull(),
  url:              text('url'),
  contentHash:      text('content_hash'),
  rawContent:       text('raw_content'),
  contentType:      text('content_type'),
  canonicalLocale:  text('canonical_locale'),
  translations:     jsonb('translations'),
  metadata:         jsonb('metadata'),
  permissions:      jsonb('permissions'),
  status:           text('status').notNull().default('active'),  // active/archived
  version:          integer('version').notNull().default(1),
  sourceUpdatedAt:  timestamp('source_updated_at', { withTimezone: true }),
  indexedAt:        timestamp('indexed_at',        { withTimezone: true }),
  createdAt:        timestamp('created_at',        { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  brandIdx: index('idx_kb_docs_brand').on(t.orgId, t.brandId, t.status),
  hashIdx:  index('idx_kb_docs_hash').on(t.contentHash),
}));

/* ──────── 切片（[PG] 与 [LibSQL] 共用 schema） ──────── */
export const kbChunks = pgTable('kb_chunks', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  brandId:        text('brand_id'),
  documentId:     text('document_id').notNull().references(() => kbDocuments.id),
  parentChunkId:  text('parent_chunk_id'),
  sectionId:      text('section_id'),
  chunkIndex:     integer('chunk_index'),
  content:        text('content').notNull(),
  contextPrefix:  text('context_prefix'),                   // Anthropic Contextual
  contentSize:    integer('content_size'),
  embedding:      vector('embedding', { dimensions: 1024 }), // [LibSQL] F32_BLOB(1024)
  locale:         text('locale'),
  permissions:    jsonb('permissions'),
  confidence:     real('confidence').notNull().default(1.0),
  metadata:       jsonb('metadata'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  brandIdx:  index('idx_kb_chunks_brand').on(t.orgId, t.brandId),
  docIdx:    index('idx_kb_chunks_doc').on(t.documentId),
  localeIdx: index('idx_kb_chunks_locale').on(t.brandId, t.locale),
  // HNSW 索引由自定义迁移建：
  //   CREATE INDEX idx_kb_chunks_vector ON kb_chunks
  //     USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=200);
}));

// [SQLite 兜底 - better-sqlite3 + sqlite-vec] 方言（由 Schema Factory 派生）：
// CREATE TABLE kb_chunks (... 同上，但去掉 embedding 列 ...);
// CREATE VIRTUAL TABLE vec_kb_chunks USING vec0(
//   id text primary key,
//   embedding float[1024],
//   org_id text partition key,
//   brand_id text partition key,
//   locale text,
//   confidence real
// );
// CREATE VIRTUAL TABLE fts_kb_chunks USING fts5(
//   id UNINDEXED, content, context_prefix,
//   org_id UNINDEXED, brand_id UNINDEXED,
//   tokenize='unicode61'
// );
// 业务通过 VectorStore + FTSStore + Store 三接口写三表（同事务），检索时并行查再 RRF。

/* ──────── 知识图谱 ──────── */
export const kbEntities = pgTable('kb_entities', {
  id:           text('id').primaryKey(),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id'),
  entityType:   text('entity_type').notNull(),
  name:         text('name').notNull(),
  aliases:      text('aliases').array(),
  description:  text('description'),
  attributes:   jsonb('attributes'),
  embedding:    vector('embedding', { dimensions: 1024 }),
  chunkIds:     text('chunk_ids').array(),
}, (t) => ({
  uq: index('uq_kb_entity').on(t.orgId, t.brandId, t.entityType, t.name),
}));

export const kbRelations = pgTable('kb_relations', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  brandId:        text('brand_id'),
  fromEntityId:   text('from_entity_id').notNull(),
  relationType:   text('relation_type').notNull(),
  toEntityId:     text('to_entity_id').notNull(),
  confidence:     real('confidence').notNull().default(1.0),
  evidenceChunks: text('evidence_chunks').array(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ──────── 检索日志（评估 + 优化） ──────── */
export const kbQueryLogs = pgTable('kb_query_logs', {
  id:               text('id').primaryKey(),
  orgId:            text('org_id').notNull(),
  brandId:          text('brand_id'),
  queryText:        text('query_text'),
  userContext:      jsonb('user_context'),
  retrievedChunks:  text('retrieved_chunks').array(),
  scores:           real('scores').array(),
  latencyMs:        integer('latency_ms'),
  usedInAnswer:     integer('used_in_answer', { mode: 'boolean' }),
  userFeedback:     text('user_feedback'),                  // helpful/not_helpful/unrelated
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// [PG] PARTITION BY RANGE (created_at) 月分区（自定义迁移）；[LibSQL] 单表 + cron 归档

/* ──────── Golden Eval 集 ──────── */
export const kbGoldenQueries = pgTable('kb_golden_queries', {
  id:                 text('id').primaryKey(),
  orgId:              text('org_id').notNull(),
  brandId:            text('brand_id'),
  query:              text('query').notNull(),
  expectedChunkIds:   text('expected_chunk_ids').array(),
  expectedAnswer:     text('expected_answer'),
  tags:               text('tags').array(),
  createdBy:          text('created_by'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 十九、代码结构

```
packages/kb/
├── package.json                # @keenai/kb
├── src/
│   ├── index.ts                # public exports
│   ├── service.ts              # KbService 入口
│   ├── sources/
│   │   ├── types.ts            # Connector / KbDocument / Permissions (Zod)
│   │   ├── help-center.ts
│   │   ├── past-conversations.ts
│   │   ├── feedback.ts
│   │   ├── changelog.ts
│   │   ├── web-crawler.ts      # crawlee + Playwright
│   │   ├── notion.ts           # @notionhq/client
│   │   ├── github.ts           # @octokit/rest
│   │   ├── confluence.ts
│   │   ├── slack.ts            # @slack/bolt
│   │   ├── discord.ts          # discord.js
│   │   ├── linear.ts           # @linear/sdk
│   │   ├── jira.ts
│   │   └── file-upload.ts
│   ├── ingest/
│   │   ├── pipeline.ts         # Inngest steps（fetch→parse→clean→chunk→enrich→embed→index）
│   │   ├── parser/
│   │   │   ├── pdf.ts          # unpdf
│   │   │   ├── docx.ts         # mammoth
│   │   │   ├── html.ts         # cheerio + readability
│   │   │   └── markdown.ts     # marked / remark
│   │   ├── cleaner.ts          # sanitize-html
│   │   ├── chunker/
│   │   │   ├── semantic.ts     # MDocument markdown strategy
│   │   │   ├── recursive.ts    # MDocument recursive strategy
│   │   │   └── hierarchical.ts
│   │   ├── enricher/
│   │   │   ├── contextual.ts   # Anthropic Contextual Retrieval（prompt caching）
│   │   │   ├── keyword.ts
│   │   │   └── entity.ts       # 写入 KG
│   │   └── embedder.ts         # @xenova/transformers / openai
│   ├── retriever/
│   │   ├── types.ts
│   │   ├── hybrid.ts           # HybridRetriever（仅依赖 storage 接口）
│   │   ├── bm25.ts             # 调用 storage.FTSStore
│   │   ├── vector.ts           # 调用 storage.VectorStore
│   │   ├── graph.ts            # 调用 storage.Store + 递归 CTE
│   │   ├── fuse.ts             # RRF + diversify + recency
│   │   ├── rerank.ts           # @xenova bge-reranker
│   │   └── filter.ts           # 翻译 storage.Expr
│   ├── graph/
│   │   ├── schema.ts           # Zod EntityType / RelationType
│   │   ├── extractor.ts        # generateObject 抽取
│   │   ├── linker.ts
│   │   └── query.ts            # 递归 CTE
│   ├── store/
│   │   ├── documents.ts        # Drizzle repo
│   │   ├── chunks.ts
│   │   ├── meili-index.ts      # Meilisearch adapter
│   │   ├── vector-adapter.ts   # 适配 storage.VectorStore
│   │   └── fts-adapter.ts      # 适配 storage.FTSStore
│   ├── version/
│   │   ├── snapshot.ts
│   │   └── rollback.ts
│   ├── eval/
│   │   ├── runner.ts           # @mastra/evals + deepeval
│   │   ├── metrics.ts
│   │   └── golden-set.ts
│   ├── mcp/
│   │   └── server.ts           # 暴露 keenai_kb_* tools
│   └── api/
│       ├── search.ts           # Hono routes
│       ├── manage.ts
│       └── playground.ts
└── tests/
    ├── ingest.test.ts
    ├── retriever.test.ts
    └── eval.test.ts
```

---

## 二十、Day-1 Quick Win 配置

无需复杂调优，开箱即用：

```yaml
quick_start:
  embedding: xenova:bge-m3                 # 本地、免费
  reranker:  xenova:bge-reranker-v2-m3
  chunking:  { strategy: markdown, maxTokens: 512 }
  retrieval:
    topK:               10
    rerankTopK:         5
    contextualRetrieval: false             # 初期省成本
  sources:
    - help_center                          # 自动
    - past_conversations                   # 自动
```

预期效果：Recall@5 ≥ 80%，无外部 API 依赖，完全本地运行。

加入 Contextual Retrieval（用 Claude Haiku 一次性预处理）后：Recall@5 ≥ 92%。

加入 Rerank 后：Precision@5 ≥ 95%。

---

## 二十一、与外部 MCP 复用（如 AgentMemory）

KeenAI 可以**直接复用** AgentMemory 作为补充记忆 + RAG 引擎，通过 MCP 集成：

```ts
// packages/mcp/src/host.ts
import { MCPClient } from '@mastra/mcp';

export const mcpHost = new MCPClient({
  servers: {
    agentmemory: {
      command: 'npx',
      args:    ['-y', '@agentmemory/mcp'],
      env:     { AGENTMEMORY_URL: 'http://localhost:3111' },
    },
  },
});
```

**双轨策略**：
- **主**：KeenAI 自研 KB + Memory（深度集成业务）
- **辅**：AgentMemory MCP（社区生态，零成本试用）

---

## 二十二、参考文档

| 来源 | 借鉴 |
|------|------|
| [AgentMemory 4-tier + Hooks + RRF](https://github.com/rohitg00/agentmemory) | 主要架构灵感 |
| [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) | Chunk Context 增强 |
| [Mastra RAG](https://mastra.ai/docs/rag) | TS 一等公民的 RAG 原语 |
| [BGE-M3 (HuggingFace)](https://huggingface.co/BAAI/bge-m3) | 默认嵌入（@xenova/transformers） |
| [Meilisearch](https://www.meilisearch.com/) | 外置 BM25（生产可选） |
| [pgvector HNSW](https://github.com/pgvector/pgvector) | PG 向量索引 |
| [LibSQL Vector](https://docs.turso.tech/features/ai-and-embeddings) | LibSQL 内置向量 |
| [sqlite-vec](https://github.com/asg017/sqlite-vec) | SQLite 向量索引（兜底） |
| [KeenAI Storage Abstraction](12-STORAGE-ABSTRACTION.md) | 接口层 + 双后端 |
| [RAGAS / DeepEval-TS](https://github.com/explodinggradients/ragas) | 评估指标 |
| [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) | Contextual 成本优化 |
| [LlamaIndex.ts Hierarchical Retrieval](https://ts.llamaindex.ai/) | 父子 chunk 模式 |
| [crawlee](https://crawlee.dev/) | TS 一流爬虫 |
| [Vercel AI SDK](https://sdk.vercel.ai/) | LLM 统一接口（embed / streamText / generateObject） |
