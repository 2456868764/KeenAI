# KeenAI Agent Memory 设计（Keeni Memory · TypeScript）

> **设计参考**：[rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) — 4 层记忆巩固、Hook Pipeline、三流检索（BM25 + Vector + Graph）、Memory Slots、人脑式衰减与遗忘  
> **本地对照源码**：克隆到仓库根目录 `agentmemory/`（见 [00-REFERENCE-REPOS.md](00-REFERENCE-REPOS.md)）  
> **落地框架**：[Mastra Memory](https://mastra.ai/docs/memory) — TypeScript 一等公民、原生 workingMemory / semanticRecall / processors 配置 + LibSQL/Postgres 双后端

---

## 一、设计目标

Keeni Memory 是 KeenAI Agent 的 **持久化记忆系统**，让 AI 客服「会记住所有事」：

| 目标 | 类比 AgentMemory | KeenAI 业务诠释 |
|------|------------------|-----------------|
| **不再重复解释** | "No more re-explaining" | 客户第二次来不用从头介绍自己 |
| **跨会话连续** | "Cross-session memory persistence" | 同客户 3 个月前的对话仍能引用 |
| **自动捕获** | "12 hooks (zero manual effort)" | 客服无需手动维护客户档案 |
| **混合检索** | "BM25 + Vector + Graph (RRF fusion)" | 找客户问题用关键词 / 语义 / 关系都能命中 |
| **隐私优先** | "Privacy filter, strip secrets" | 信用卡号、密码自动脱敏 |
| **自我遗忘** | "TTL expiry, contradiction detection" | 客户偏好变更时，旧偏好自动淘汰 |
| **可追溯** | "Citation provenance" | 每条记忆能追到原始对话 |
| **团队共享** | "Namespaced shared + private" | 跨客服/跨团队共享客户洞察 |

---

## 二、Memory vs 知识库（Knowledge Base）区别

KeenAI 同时拥有「记忆」与「知识库」，二者职责不同：

| 维度 | **Memory（记忆）** | **Knowledge Base（知识库）** |
|------|--------------------|------------------------------|
| 来源 | 对话自动捕获 + Agent 自反思 | Help Center + 上传文档 + 网页爬取 |
| 主体 | **个体性**（某客户 / 某品牌） | **集体性**（产品级 / 全局） |
| 更新 | 实时（每条消息） | 周期 / 触发性 |
| 寿命 | 衰减、合并、可遗忘 | 长期、版本化 |
| 用途 | 「这个客户是谁、Ta 喜欢什么」 | 「这个产品怎么用」 |
| 检索粒度 | 单 Slot / 单 Episode | Chunk |
| 隔离 | per-Customer / per-Brand | per-Brand / Global |
| 落地框架 | `@mastra/memory` + `@keenai/memory` | `@mastra/rag` + `@keenai/kb` |

**协同**：
> Agent 同时检索两者 — Memory 提供「人」的上下文，KB 提供「事」的答案。

---

## 三、四层记忆巩固模型

完全参考 AgentMemory 的人脑式 4-Tier，并映射到 Mastra Memory 的原生概念：

```
┌──────────────────────────────────────────────────────────────┐
│  L4: Procedural Memory  → 「如何处理此类问题」                 │
│      （客服 SOP、Skill、Workflow 模式）                        │
│      存储：skills + workflows + memory_patterns                │
├──────────────────────────────────────────────────────────────┤
│  L3: Semantic Memory    → 「关于客户/产品的事实」               │
│      （客户偏好、订阅计划、历史决策、产品配置）                  │
│      存储：memory_facts + memory_slots（workingMemory 模板）    │
├──────────────────────────────────────────────────────────────┤
│  L2: Episodic Memory    → 「发生了什么」                       │
│      （会话摘要、关键事件、转折点）                              │
│      存储：memory_episodes（thread summaries）                  │
├──────────────────────────────────────────────────────────────┤
│  L1: Working Memory     → 「原始观察」                          │
│      （当前会话消息、工具调用、用户输入）                        │
│      存储：mastra_messages（Mastra 内置 + KeenAI observations） │
└──────────────────────────────────────────────────────────────┘

        ↓ 巩固流动方向（Working → Procedural）— Inngest scheduled
        ↑ 检索流动方向（任一层都可被 Agent 查询）— Mastra Memory.search
```

### 3.1 每层数据示例

```yaml
# L1 Working Memory（原始 · Mastra Thread Messages + KeenAI observations）
observation_001:
  type: user_message
  content: "我想把订阅升级到 Pro，但担心价格"
  threadId: sess_xxx          # Mastra threadId
  resourceId: cust_yyy        # Mastra resourceId（= customer id）
  timestamp: 2026-05-19T10:00:00Z

# L2 Episodic Memory（会话摘要）
session_summary_001:
  threadId: sess_xxx
  resourceId: cust_yyy
  topic: "Pro 计划升级咨询 + 价格异议"
  durationMs: 720000
  resolution: "客服提供 20% 年付折扣，客户接受"
  keyEvents:
    - customer_asked_about_pro_features
    - customer_objected_to_price
    - agent_offered_discount
    - upgrade_completed

# L3 Semantic Memory（事实）
fact_001:
  resourceId: cust_yyy
  fact: "对价格敏感"
  confidence: 0.85
  evidence: [sess_xxx, sess_zzz]
  decayRate: low

slot_persona_cust_yyy:                     # Mastra workingMemory 渲染
  contentMd: |
    # User Profile
    - Plan: Pro
    - Payment: Annual
    - Communication: Email preferred
    - Language: zh-CN
    - History: free → growth (2025-12) → pro (2026-05)
    - Objections: price (2x), feature_complexity (1x)

# L4 Procedural Memory（程序性 · 可提升为 Skill）
pattern_001:
  name: "price_objection_resolution"
  trigger: "customer mentions price concern"
  steps:
    - acknowledge_concern
    - highlight_value
    - offer_annual_discount
    - close_with_urgency
  successRate: 0.78
  evidenceSessions: 23
```

---

## 四、记忆主键与隔离

### 4.1 多租户记忆作用域

```
Org（组织 / Workspace）
  └─ Brand（品牌）
       ├─ Conversation Memory（per Conversation，短期）  ← Mastra threadId
       ├─ Customer Memory（per Customer，中长期）  ★ 核心   ← Mastra resourceId
       ├─ Team Memory（per Team，共享）
       ├─ Agent Memory（per Member 客服，可选）
       └─ Brand Memory（per Brand，全局）
```

**关键映射**：
- Mastra `threadId` = `conversationId`
- Mastra `resourceId` = `${orgId}:${brandId}:${customerId}`（保证多租户隔离）

### 4.2 命名空间（TypeScript 类型）

```ts
// packages/memory/src/scope.ts
import { z } from 'zod';

export const MemoryLayer = z.enum(['working', 'episodic', 'semantic', 'procedural']);
export const MemorySubject = z.enum(['customer', 'team', 'brand', 'agent']);

export const MemoryScope = z.object({
  orgId:     z.string(),
  brandId:   z.string(),
  layer:     MemoryLayer,
  subject:   MemorySubject,
  subjectId: z.string(),
});
export type MemoryScope = z.infer<typeof MemoryScope>;

/** 构造 Mastra-兼容的 resourceId */
export const toResourceId = (s: Omit<MemoryScope, 'layer'>) =>
  `${s.orgId}:${s.brandId}:${s.subject}:${s.subjectId}`;

/** 示例：检索某客户的 Semantic Memory */
const scope: MemoryScope = {
  orgId:     'org_001',
  brandId:   'brand_main',
  layer:     'semantic',
  subject:   'customer',
  subjectId: 'cust_yyy',
};
const results = await memory.search({ scope, query: '退款偏好' });
```

---

## 五、Memory Pipeline（管道）

完全对应 AgentMemory 的 Pipeline，落地为 Mastra Memory `processors` + Inngest async jobs + KeenAI Hook Bus：

```
┌──────────────────────────────────────────────────────────────┐
│  Hook 触发（消息接收 / 工具完成 / 会话结束）                    │
│   → 发布到 Inngest 事件总线                                    │
│                          ↓                                    │
│  SHA-256 去重（5 分钟窗口，避免重复触发）                       │
│                          ↓                                    │
│  Privacy Filter（脱敏）                                        │
│    - 信用卡号（PCI）                                           │
│    - 邮箱 / 手机号（GDPR 可选）                                │
│    - 密码 / API Key（regex 匹配）                              │
│    - 自定义敏感词                                              │
│                          ↓                                    │
│  原始 Observation 写入 L1                                      │
│    （Mastra mastra_messages + KeenAI memory_observations）     │
│                          ↓                                    │
│  Async LLM Compression（Vercel AI SDK generateObject）          │
│    → 结构化 Facts + Concepts + Narrative                       │
│                          ↓                                    │
│  Embedding 生成（@xenova/transformers bge-m3 / OpenAI）         │
│                          ↓                                    │
│  双索引写入：FTSStore（BM25）+ VectorStore                      │
│    实现：PG: tsvector / LibSQL: FTS5 / 外置: Meilisearch       │
│         PG: pgvector / LibSQL: libsql_vector / sqlite-vec      │
│                          ↓                                    │
│  Knowledge Graph 提取（实体 + 关系）                            │
└──────────────────────────────────────────────────────────────┘

         ↓（Inngest scheduled jobs / event triggered）

┌──────────────────────────────────────────────────────────────┐
│  Session 结束 / 周期任务                                        │
│                                                                │
│  Episodic Consolidation                                        │
│    L1 → L2: 会话摘要 + Key Events                              │
│                                                                │
│  Semantic Extraction                                           │
│    L1+L2 → L3: 提取 Facts / 更新 Slots（workingMemory 重写）    │
│    （矛盾检测、合并相似事实）                                    │
│                                                                │
│  Procedural Mining                                             │
│    L1-L3 → L4: 发现重复模式 → 提议 Skill                       │
│                                                                │
│  Decay Sweep                                                   │
│    所有层：按 Ebbinghaus 曲线衰减 confidence                    │
│    confidence < threshold → 归档/删除                           │
└──────────────────────────────────────────────────────────────┘
```

### 5.1 Mastra Memory 构造

```ts
// packages/memory/src/build.ts
import { Memory } from '@mastra/memory';
import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';
import { TrajectoryCompressor } from './processors/trajectory-compressor.js';
import { PiiFilter }            from './processors/pii-filter.js';
import { ConfidenceFilter }     from './processors/confidence-filter.js';
import { buildStorage, buildVector } from './storage.js';

export async function buildKeeniMemory(orgId: string, brandId: string) {
  const storage = await buildStorage();          // LibSQLStore | PostgresStore
  const vector  = await buildVector();
  return new Memory({
    storage,
    vector,
    embedder: 'openai/text-embedding-3-small',   // 或 'xenova/bge-m3'（本地）
    options: {
      lastMessages: 20,
      semanticRecall: {
        topK:         3,
        messageRange: { before: 2, after: 1 },
        scope:        'resource',                // 跨 thread 检索同 resourceId
      },
      workingMemory: {
        enabled:  true,
        template: KEENI_USER_PROFILE_TEMPLATE,   // 见 §7 Slots
      },
      threads: { generateTitle: true },
    },
    processors: [
      new PiiFilter(),                           // 0. 隐私过滤（最先）
      new ToolCallFilter({ exclude: ['debug_tool'] }),
      new TrajectoryCompressor({ keepLast: 5, targetTokens: 1500 }),
      new ConfidenceFilter({ minConfidence: 0.3 }),
      new TokenLimiter({ limit: 4000 }),         // 兜底
    ],
  });
}
```

### 5.2 双后端存储（与 12 号文档对齐）

```ts
// packages/memory/src/storage.ts
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { PostgresStore, PgVector }   from '@mastra/pg';
import { config } from '@keenai/config';

export async function buildStorage() {
  if (config.storage.primary.driver === 'postgres') {
    return new PostgresStore({ connectionString: config.storage.primary.dsn });
  }
  return new LibSQLStore({ url: config.storage.primary.dsn });
}

export async function buildVector() {
  if (config.storage.vector.driver === 'pgvector') {
    return new PgVector({ connectionString: config.storage.primary.dsn });
  }
  return new LibSQLVector({ connectionString: config.storage.primary.dsn });
}
```

---

## 六、Hooks（自动捕获钩子）

参考 AgentMemory 12 个 Hook，KeenAI 定义业务级 Hook，全部基于 **Inngest 事件总线** 解耦：

| Hook | 触发时机 | 捕获内容 | Inngest 事件 |
|------|----------|----------|--------------|
| **ConversationStart** | 新对话创建 | 客户身份、来源渠道、初始上下文 | `conversation/started` |
| **MessageReceived** | 客户消息到达 | 内容、附件、情绪、意图 | `conversation/message.received` |
| **MessageSent** | 客服 / AI 发送消息 | 内容、来源（人工/AI）、采纳的 Macro/Skill | `conversation/message.sent` |
| **ToolPreExecute** | 工具调用前 | Tool 名、参数、调用原因 | `agent/tool.pre` |
| **ToolPostExecute** | 工具调用后 | 结果、耗时、错误 | `agent/tool.post` |
| **CustomActionExecute** | Custom Action 执行 | API endpoint、参数、响应 | `agent/action.executed` |
| **SkillTriggered** | Skill 被触发 | Skill 名、版本、步骤 | `agent/skill.triggered` |
| **AssignmentChanged** | 分配变更 | from/to 客服、原因 | `conversation/assigned` |
| **TicketCreated** | 工单创建 | Type、关联对话 | `ticket/created` |
| **StatusChanged** | 对话状态变更 | from/to 状态 | `conversation/status.changed` |
| **CustomerRated** | 客户评分 | CSAT、评论 | `conversation/rated` |
| **ConversationClosed** | 对话关闭 | 解决方式（AI/人工/未解决） | `conversation/closed` |
| **SessionEnd** | 会话超时关闭 | 触发 L1→L2 巩固 | `conversation/idle.timeout` |
| **PreCompact** | 上下文压缩前 | 重新注入关键记忆 | `agent/context.pre_compact` |

### 6.1 Hook 实现（Inngest function）

```ts
// apps/worker/src/jobs/memory-on-message.ts
import { inngest } from '@keenai/workflow/inngest';
import { buildKeeniMemory } from '@keenai/memory';
import { dedup, sanitize } from '@keenai/memory/pipeline';
import { createHash } from 'node:crypto';

export const memoryOnMessageReceived = inngest.createFunction(
  { id: 'memory-on-message-received', retries: 3 },
  { event: 'conversation/message.received' },
  async ({ event, step }) => {
    const { orgId, brandId, customerId, conversationId, message } = event.data;

    // 1. 去重
    const hash = createHash('sha256').update(JSON.stringify(message)).digest('hex');
    if (await step.run('dedup', () => dedup.check(hash, 300))) return;

    // 2. 隐私过滤
    const sanitized = await step.run('sanitize', () => sanitize(message));

    // 3. 写入 L1（Mastra Memory + KeenAI observations）
    await step.run('persist-observation', async () => {
      const memory = await buildKeeniMemory(orgId, brandId);
      await memory.addMessage({
        threadId:   conversationId,
        resourceId: `${orgId}:${brandId}:customer:${customerId}`,
        message:    sanitized,
      });
    });

    // 4. 异步嵌入 + KG 抽取（fan-out）
    await step.sendEvent('memory/index', {
      name: 'memory/index',
      data: { hash, conversationId, customerId, orgId, brandId },
    });
  },
);
```

---

## 七、Memory Slots（可编辑固定槽位 · Mastra workingMemory）

参考 AgentMemory `AGENTMEMORY_SLOTS`，KeenAI 用 Mastra `workingMemory.template` 渲染为客户可读 Markdown，Agent 可直接通过 `updateWorkingMemory` tool 编辑：

| Slot | 内容 | 用途 |
|------|------|------|
| `persona` | 客户身份概要 | 「张三，Pro 用户，前端工程师」 |
| `preferences` | 偏好与习惯 | 「偏好邮件沟通、不喜电话、年付」 |
| `pinned_facts` | 重要事实（不易遗忘） | 「VIP 客户，月付 $5000」 |
| `recurring_issues` | 重复问题 | 「频繁询问导出功能」 |
| `last_resolution` | 上次解决方案 | 「上次用清缓存解决登录问题」 |
| `pending_items` | 待办 / 承诺 | 「承诺周三回复 API 文档」 |
| `objections` | 异议历史 | 「价格敏感、关心 GDPR」 |
| `relationships` | 关键关系 | 「Owner of Acme Corp; 同事是 Alice」 |

### 7.1 Mastra workingMemory 模板

```ts
// packages/memory/src/templates.ts
export const KEENI_USER_PROFILE_TEMPLATE = `
# Customer Profile

## Persona
- Name:
- Tier:
- Role / Industry:
- Locale / Timezone:

## Preferences
- Communication: <email|in-app|phone>
- Cadence: <annual|monthly>
- Style: <concise|detailed>

## Pinned Facts
- ...

## Recurring Issues
- ...

## Last Resolution
- ...

## Pending Promises
- [ ] ...

## Objections History
- price (×N)
- ...

## Relationships
- WORKS_AT:
- COLLEAGUES:
- ...
`;
```

### 7.2 Slot 数据结构（Drizzle）

> Mastra workingMemory 自动持久化到 `mastra_resources.workingMemory`（Markdown 文本）。
> KeenAI 在此之上加一层 **结构化 Slot 表** 用于精细化检索 / 审计 / 多团队共享：

```ts
// packages/db/schema/memory-slots.ts
import { pgTable, text, integer, real, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const memorySlots = pgTable('memory_slots', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  scope:          text('scope', { enum: ['customer', 'team', 'brand'] }).notNull(),
  subjectId:      text('subject_id').notNull(),
  slotName:       text('slot_name').notNull(),
  content:        text('content'),               // markdown，size-limited
  contentSize:    integer('content_size'),
  confidence:     real('confidence').notNull().default(1.0),
  lastEditedBy:   text('last_edited_by'),        // ai_agent / member_id / system
  lastEditedAt:   timestamp('last_edited_at', { withTimezone: true }),
  version:        integer('version').notNull().default(1),
}, (t) => ({
  uq: uniqueIndex('uq_slot').on(t.orgId, t.scope, t.subjectId, t.slotName),
}));

export const memorySlotHistory = pgTable('memory_slot_history', {
  id:          text('id').primaryKey(),
  slotId:      text('slot_id').notNull(),
  content:     text('content'),
  editedBy:    text('edited_by'),
  editedAt:    timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
  editReason:  text('edit_reason'),
});
```

### 7.3 Slot 大小限制

```ts
// packages/memory/src/limits.ts
export const SLOT_LIMITS = {
  persona:         500,
  preferences:    1000,
  pinned_facts:   2000,
  recurring_issues: 1000,
  last_resolution: 1000,
  pending_items:  2000,
  objections:     1000,
  relationships:  1000,
  total_per_customer: 10_000,
} as const;
```

超出限制时，Agent 应「自我裁剪」（保留最重要项），通过 LLM 决策保留哪些。

---

## 八、三流检索（Triple-stream Retrieval）

完全参考 AgentMemory 的设计，但适配 KeenAI 的多租户 + 双后端：

### 8.1 检索流

```
                    用户问题 / 检索请求
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │   BM25   │      │  Vector  │      │  Graph   │
  │  Stream  │      │  Stream  │      │  Stream  │
  └────┬─────┘      └────┬─────┘      └────┬─────┘
       │                 │                 │
       │  关键词         │  语义           │  实体关系
       │  FTSStore       │  VectorStore    │  Store (relations table)
       │  (FTS5/tsvec/   │  (sqlite-vec/   │  + 递归 CTE / BFS
       │   Meili)        │   pgvector/     │
       │                 │   libsql_vector)│
       └────────┬────────┴────────┬────────┘
                ▼                 ▼
            ┌─────────────────────────┐
            │  RRF Fusion（k=60）      │
            │  + Session Diversify     │
            │  + Recency Bias          │
            │  + Confidence Weight     │
            └────────────┬────────────┘
                         ▼
                  ┌─────────────┐
                  │   Rerank     │
                  │ (bge-rerank  │
                  │  via Xenova) │
                  └──────┬──────┘
                         ▼
                  ┌─────────────┐
                  │  Top-K Out   │
                  └─────────────┘
```

### 8.2 RRF 实现

```ts
// packages/memory/src/retrieval/rrf.ts
import type { SearchHit } from '@keenai/storage';

export interface RankedSource { hits: SearchHit[] }

export function rrfFuse(sources: RankedSource[], k = 60): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  for (const src of sources) {
    src.hits.forEach((hit, rank) => {
      const prev = scores.get(hit.id);
      const score = (prev?.score ?? 0) + 1 / (k + rank);
      scores.set(hit.id, { hit: prev?.hit ?? hit, score });
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ hit, score }) => ({ ...hit, score }));
}

/** 多样性约束：每个 session 最多 N 条 */
export function diversify(hits: SearchHit[], maxPerSession = 3): SearchHit[] {
  const count = new Map<string, number>();
  return hits.filter((h) => {
    const sid = (h.metadata?.sessionId as string) ?? 'unknown';
    const c = (count.get(sid) ?? 0) + 1;
    count.set(sid, c);
    return c <= maxPerSession;
  });
}
```

### 8.3 Recency Bias（时间衰减）

```ts
// packages/memory/src/retrieval/recency.ts
export function recencyBoost(timestamp: Date, halfLifeDays = 30): number {
  const daysAgo = (Date.now() - timestamp.getTime()) / 86_400_000;
  return Math.exp(-daysAgo * Math.LN2 / halfLifeDays);
}

export function applyRecency(hit: SearchHit & { createdAt: Date }) {
  const boost = recencyBoost(hit.createdAt);
  return { ...hit, score: hit.score * (0.7 + 0.3 * boost) };
}
```

### 8.4 Confidence Weight

```ts
export function applyConfidence(hit: SearchHit) {
  const conf = (hit.metadata?.confidence as number) ?? 1.0;
  return { ...hit, score: hit.score * conf };
}
```

每条记忆有 `confidence ∈ [0, 1]`：
- 客服明确确认 → 1.0
- AI 推断 → 0.7
- 隐式提及 → 0.5
- 矛盾未解决 → 0.3

---

## 九、Knowledge Graph（知识图谱）

### 9.1 实体抽取（Vercel AI SDK `generateObject`）

```ts
// packages/memory/src/kg/extractor.ts
import { generateObject } from 'ai';
import { z } from 'zod';
import { modelForRoute } from '@keenai/llm';

const ExtractedKG = z.object({
  entities: z.array(z.object({
    type: z.enum(['person', 'org', 'product', 'topic', 'feature']),
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    attributes: z.record(z.unknown()).default({}),
  })),
  relations: z.array(z.object({
    fromName:     z.string(),
    relationType: z.enum(['works_at', 'role', 'concerns', 'owns', 'mentioned_with', 'requested', 'questioned']),
    toName:       z.string(),
    confidence:   z.number().min(0).max(1),
  })),
});

export async function extractKG(text: string) {
  const { object } = await generateObject({
    model:  modelForRoute('classification'),
    schema: ExtractedKG,
    prompt: `Extract named entities and relations from the customer support snippet:\n\n${text}`,
  });
  return object;
}
```

### 9.2 图谱存储（Drizzle）

```ts
// packages/db/schema/memory-graph.ts
import { pgTable, text, real, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const memoryEntities = pgTable('memory_entities', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  entityType:     text('entity_type').notNull(),
  name:           text('name').notNull(),
  aliases:        text('aliases').array(),
  attributes:     jsonb('attributes'),
  embedding:      vector('embedding', { dimensions: 1024 }),
  mentionCount:   integer('mention_count').notNull().default(1),
  firstMentioned: timestamp('first_mentioned', { withTimezone: true }),
  lastMentioned:  timestamp('last_mentioned', { withTimezone: true }),
}, (t) => ({
  uq: uniqueIndex('uq_entity').on(t.orgId, t.entityType, t.name),
}));

export const memoryRelations = pgTable('memory_relations', {
  id:           text('id').primaryKey(),
  orgId:        text('org_id').notNull(),
  fromEntityId: text('from_entity_id').notNull(),
  relationType: text('relation_type').notNull(),
  toEntityId:   text('to_entity_id').notNull(),
  confidence:   real('confidence').notNull().default(1.0),
  evidence:     text('evidence').array(),       // session_ids
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  fromIdx: index('idx_relations_from').on(t.fromEntityId),
  toIdx:   index('idx_relations_to').on(t.toEntityId),
}));
```

> **SQLite 等价**：`vector` 列改为 `blob('embedding')`（LibSQL `F32_BLOB`）或独立 `vec0` 虚拟表，由 12 号文档的 Schema Factory 自动生成。

### 9.3 图谱查询示例（递归 CTE）

```ts
// packages/memory/src/kg/query.ts
import { sql } from 'drizzle-orm';
import type { Store } from '@keenai/storage';

export async function relatedTopics(store: Store, entityId: string, maxDepth = 3) {
  return store.db.execute(sql.raw(`
    WITH RECURSIVE related AS (
      SELECT to_entity_id AS id, relation_type, 1 AS depth
      FROM memory_relations
      WHERE from_entity_id = '${entityId}'
        AND relation_type IN ('concerns', 'requested', 'questioned')

      UNION

      SELECT mr.to_entity_id, mr.relation_type, r.depth + 1
      FROM memory_relations mr
      JOIN related r ON mr.from_entity_id = r.id
      WHERE r.depth < ${maxDepth}
    )
    SELECT * FROM related
  `));
}
```

> SQLite 也支持 `WITH RECURSIVE`，同一份 SQL 在两后端均可运行。

---

## 十、记忆生命周期（Decay & Eviction）

### 10.1 Ebbinghaus 衰减

```ts
// packages/memory/src/lifecycle/decay.ts
export function memoryStrength(
  initialConfidence: number,
  daysSinceLastAccess: number,
  halfLifeDays = 14,
): number {
  const decay = Math.exp(-daysSinceLastAccess * Math.LN2 / halfLifeDays);
  return initialConfidence * decay;
}
```

每天 03:00 由 Inngest scheduled job 扫描：

```ts
// apps/worker/src/cron.ts
export const memoryDecaySweep = inngest.createFunction(
  { id: 'memory-decay-sweep' },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    await step.run('sweep-facts', () => sweepDecay('memory_facts'));
    await step.run('sweep-episodes', () => sweepDecay('memory_episodes'));
  },
);
```

### 10.2 矛盾检测

```
新事实：「客户偏好邮件」
旧事实：「客户偏好电话」（同 Slot 主题，矛盾）

→ ContradictionDetector
    ├─ 时间戳新 + 来源可靠 → 替换旧事实
    ├─ 时间戳旧但来源更可靠 → 保留旧事实，标记新事实为「待确认」
    └─ 无法判断 → 标记 conflict，下次对话主动澄清
```

```ts
// packages/memory/src/lifecycle/contradiction.ts
import { generateObject } from 'ai';
import { z } from 'zod';

const Verdict = z.object({
  action: z.enum(['replace', 'keep_old', 'ask_user', 'merge']),
  rationale: z.string(),
});

export async function detectContradiction(oldFact: Fact, newFact: Fact) {
  if (!sameSubject(oldFact, newFact)) return { action: 'merge' as const };
  const { object } = await generateObject({
    model: modelForRoute('classification'),
    schema: Verdict,
    prompt: contradictionPrompt(oldFact, newFact),
  });
  return object;
}
```

### 10.3 重要性驱逐

```ts
// packages/memory/src/lifecycle/eviction.ts
export function evictionScore(m: {
  confidence: number;
  accessFrequency: number;
  recencyScore: number;
  importanceScore: number;
}) {
  return (
    m.confidence       * 0.3 +
    m.accessFrequency  * 0.3 +
    m.recencyScore     * 0.2 +
    m.importanceScore  * 0.2
  );
}
// Slot 容量超限时，按分数排序，最低分驱逐
```

### 10.4 「软删除 + 审计」

记忆从不真正删除，而是 `archivedAt is not null`，便于：
- 审计（GDPR：客户要求查看自己的所有记忆）
- 恢复（误删时回滚）
- 训练数据回填（未来 fine-tune 模型）

---

## 十一、隐私与合规

### 11.1 PII 过滤（Mastra Memory Processor）

```ts
// packages/memory/src/processors/pii-filter.ts
import type { MemoryProcessor, MessageList } from '@mastra/core/memory';

const PATTERNS = [
  { name: 'credit_card', re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,            mask: '****-****-****-####' },
  { name: 'email',       re: /\b[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,                  mask: '<email>' },        // tag-only by default
  { name: 'phone_cn',    re: /\b1[3-9]\d{9}\b/g,                                       mask: '<phone>' },
  { name: 'id_card_cn',  re: /\b\d{17}[\dXx]\b/g,                                      mask: '<idcard>' },
  { name: 'api_key',     re: /(sk-[\w]{20,}|Bearer\s+[\w\-.]+)/g,                      mask: '<secret>' },
  { name: 'password',    re: /password["']?\s*[:=]\s*["']?(\S+)/gi,                    mask: 'password=<redacted>' },
];

export class PiiFilter implements MemoryProcessor {
  constructor(private opts: { mode?: 'redact' | 'tag' } = {}) {}
  async process(messages: MessageList): Promise<MessageList> {
    return messages.map((m) => ({
      ...m,
      content: typeof m.content === 'string'
        ? PATTERNS.reduce((s, p) => s.replace(p.re, p.mask), m.content)
        : m.content,
    }));
  }
}
```

### 11.2 GDPR 接口

```ts
// apps/api/src/routes/gdpr.ts
import { Hono } from 'hono';

export const gdprRoutes = new Hono()
  /** 数据可携权：导出用户所有记忆 */
  .get('/users/:userId/memory/export', async (c) => {
    const data = await memoryService.export(c.req.param('userId'));
    return c.json(data);
  })
  /** 删除权：彻底删除（硬删） */
  .delete('/users/:userId/memory', async (c) => {
    const { confirm, reason } = c.req.query();
    if (confirm !== 'true') return c.json({ error: 'confirm required' }, 400);
    await memoryService.deleteAll(c.req.param('userId'), reason);
    return c.json({ deleted: true });
  })
  /** 访问权：可读 Markdown 报告 */
  .get('/users/:userId/memory/view', async (c) => {
    const md = await memoryService.renderMarkdown(c.req.param('userId'));
    return c.body(md, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
  });
```

### 11.3 审计日志

```ts
// 所有 Memory 写入/读取/删除都进 memory_audit + audit_logs
await store.db.insert(memoryAudit).values({
  orgId,
  actorType:  'ai_agent',
  actorId:    'keeni',
  operation:  'memory.write',
  layer:      'semantic',
  resourceId: slotId,
  payload:    { slot: 'preferences', before, after },
});
```

---

## 十二、Team Memory（团队记忆）

参考 AgentMemory 的「Namespaced shared + private」：

```yaml
team_memory:
  - scope: team:support
    visibleTo: [members of team:support]
    examples:
      - "客户 Acme 是关键 VIP，所有问题优先处理"
      - "退款流程必须经过 Finance 审批"

  - scope: brand:acme
    visibleTo: [all members of brand]
    examples:
      - "本品牌不提供电话支持"

  - scope: member:alice           # 客服个人笔记
    visibleTo: [Alice only]
    examples:
      - "Alice 个人偏好的回复模板"
```

实现：`memorySlots.scope` 为 `team` / `brand` / `member`，检索时 join `member_team` 表做 ACL。

---

## 十三、数据模型完整 Schema（Drizzle）

> **双后端**：以下 PG 方言由 [Storage Abstraction Layer](12-STORAGE-ABSTRACTION.md) 的 Schema Factory 自动生成 SQLite/LibSQL 等价表。

```ts
// packages/db/schema/memory.ts
import { pgTable, text, integer, real, jsonb, timestamp, vector, index, uniqueIndex } from 'drizzle-orm/pg-core';

/* ──────────── L1: Working Memory ──────────── */
export const memoryObservations = pgTable('memory_observations', {
  id:            text('id').primaryKey(),
  orgId:         text('org_id').notNull(),
  scope:         text('scope', { enum: ['customer', 'team', 'brand'] }).notNull(),
  subjectId:     text('subject_id').notNull(),
  sessionId:     text('session_id').notNull(),
  eventType:     text('event_type', { enum: ['message', 'tool', 'event'] }).notNull(),
  content:       text('content').notNull(),     // 已脱敏
  rawHash:       text('raw_hash'),              // SHA-256 去重
  metadata:      jsonb('metadata'),
  embedding:     vector('embedding', { dimensions: 1024 }),   // [PG] pgvector；[LibSQL] F32_BLOB(1024)
  confidence:    real('confidence').notNull().default(1.0),
  importance:    real('importance').notNull().default(0.5),
  accessCount:   integer('access_count').notNull().default(0),
  lastAccessed:  timestamp('last_accessed', { withTimezone: true }),
  expiresAt:     timestamp('expires_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index('idx_obs_subject').on(t.orgId, t.scope, t.subjectId, t.createdAt),
  hashIdx:    index('idx_obs_hash').on(t.rawHash),
  // HNSW 由自定义迁移建：CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
}));
// [PG] PARTITION BY RANGE (created_at) 月分区（由自定义迁移建）
// [LibSQL] 单表 + 索引；超期数据走 Inngest 归档 job

/* ──────────── L2: Episodic Memory ──────────── */
export const memoryEpisodes = pgTable('memory_episodes', {
  id:          text('id').primaryKey(),
  orgId:       text('org_id').notNull(),
  scope:       text('scope').notNull(),
  subjectId:   text('subject_id').notNull(),
  sessionId:   text('session_id').notNull(),
  title:       text('title'),
  summary:     text('summary').notNull(),
  topic:       text('topic'),
  sentiment:   text('sentiment'),
  resolution:  text('resolution', { enum: ['resolved', 'escalated', 'abandoned'] }),
  keyEvents:   jsonb('key_events'),
  embedding:   vector('embedding', { dimensions: 1024 }),
  confidence:  real('confidence').notNull().default(1.0),
  startedAt:   timestamp('started_at', { withTimezone: true }),
  endedAt:     timestamp('ended_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index('idx_ep_subject').on(t.orgId, t.scope, t.subjectId, t.endedAt),
}));

/* ──────────── L3: Semantic Memory ──────────── */
export const memoryFacts = pgTable('memory_facts', {
  id:            text('id').primaryKey(),
  orgId:         text('org_id').notNull(),
  scope:         text('scope').notNull(),
  subjectId:     text('subject_id').notNull(),
  fact:          text('fact').notNull(),
  category:      text('category'),                 // preference/history/role/...
  confidence:    real('confidence').notNull().default(1.0),
  evidence:      text('evidence').array(),          // observation_ids
  contradicts:   text('contradicts').array(),       // fact_ids
  supersededBy:  text('superseded_by'),
  lastConfirmed: timestamp('last_confirmed', { withTimezone: true }),
  embedding:     vector('embedding', { dimensions: 1024 }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt:    timestamp('archived_at', { withTimezone: true }),
});

/* ──────────── L4: Procedural Memory ──────────── */
export const memoryPatterns = pgTable('memory_patterns', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  scope:          text('scope').notNull().default('brand'),
  subjectId:      text('subject_id').notNull(),
  name:           text('name').notNull(),
  trigger:        jsonb('trigger'),
  steps:          jsonb('steps'),
  successCount:   integer('success_count').notNull().default(0),
  failureCount:   integer('failure_count').notNull().default(0),
  avgDurationMs:  integer('avg_duration_ms'),
  skillId:        text('skill_id'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ──────────── Audit ──────────── */
export const memoryAudit = pgTable('memory_audit', {
  id:          text('id').primaryKey(),
  orgId:       text('org_id').notNull(),
  actorType:   text('actor_type'),
  actorId:     text('actor_id'),
  operation:   text('operation'),
  layer:       text('layer'),
  resourceId:  text('resource_id'),
  payload:     jsonb('payload'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// [PG] PARTITION BY RANGE (created_at) 月分区；[LibSQL] 按月归档
```

---

## 十四、HTTP API 设计

参考 AgentMemory REST API，KeenAI Memory 暴露：

### 14.1 写入

```http
POST /api/memory/observations
Content-Type: application/json
{
  "scope": "customer",
  "subjectId": "cust_yyy",
  "eventType": "message",
  "content": "...",
  "sessionId": "sess_xxx",
  "metadata": {...}
}

POST /api/memory/slots
{
  "scope": "customer",
  "subjectId": "cust_yyy",
  "slotName": "preferences",
  "content": "偏好邮件沟通..."
}

POST /api/memory/facts
{
  "scope": "customer",
  "subjectId": "cust_yyy",
  "fact": "VIP customer",
  "category": "tier",
  "confidence": 1.0
}
```

### 14.2 检索

```http
POST /api/memory/search
{
  "scope": "customer",
  "subjectId": "cust_yyy",
  "query": "退款偏好",
  "layers": ["semantic", "episodic"],
  "topK": 10,
  "minConfidence": 0.5
}

→ {
  "results": [
    {
      "id": "fact_xxx",
      "layer": "semantic",
      "content": "客户偏好年付（享 20% 折扣）",
      "confidence": 0.85,
      "score": 0.92,
      "source": ["sess_xxx"]
    }
  ]
}
```

### 14.3 巩固 / 遗忘 / Profile

```http
POST /api/memory/consolidate
{
  "scope": "customer",
  "subjectId": "cust_yyy",
  "sessionId": "sess_xxx"
}

POST /api/memory/forget
{ "id": "fact_xxx", "reason": "user_request" }

GET  /api/memory/profile?customerId=cust_yyy
```

### 14.4 Hono 路由示例

```ts
// apps/api/src/routes/memory.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export const memoryRoutes = new Hono()
  .post('/memory/search',
    zValidator('json', z.object({
      scope: z.enum(['customer', 'team', 'brand']),
      subjectId: z.string(),
      query: z.string(),
      layers: z.array(z.enum(['working', 'episodic', 'semantic', 'procedural'])).optional(),
      topK: z.number().int().min(1).max(50).default(10),
      minConfidence: z.number().min(0).max(1).default(0.5),
    })),
    async (c) => c.json(await memoryService.search(c.req.valid('json'))),
  );
```

### 14.5 MCP 工具暴露

KeenAI Memory 也作为 **MCP Server**，工具列表参考 AgentMemory：

```
keeni_memory_search           # 智能检索
keeni_memory_save             # 保存事实/观察
keeni_memory_recall           # 按主题召回
keeni_memory_slot_get         # 读取 Slot
keeni_memory_slot_set         # 写入 Slot
keeni_memory_profile          # 客户画像
keeni_memory_sessions         # 历史会话列表
keeni_memory_timeline         # 时序事件
keeni_memory_graph_query      # 图谱查询
keeni_memory_consolidate      # 触发巩固
keeni_memory_forget           # 删除
keeni_memory_export           # 导出
```

> Mastra 还内置 `updateWorkingMemory` 工具，Agent 可直接通过 Vercel AI SDK tool calling 更新客户档案，无需走 REST。

---

## 十五、Agent 使用 Memory 的典型流程（TypeScript）

### 15.1 入会话（ConversationStart）

```ts
// packages/agent/src/lifecycle.ts
export async function onConversationStart(p: {
  orgId: string; brandId: string; conversationId: string; customerId: string;
}) {
  const memory = await buildKeeniMemory(p.orgId, p.brandId);
  const resourceId = `${p.orgId}:${p.brandId}:customer:${p.customerId}`;

  // 1. 加载客户 Profile（Mastra workingMemory 自动从 mastra_resources 读取）
  const wm = await memory.getWorkingMemory({ resourceId });

  // 2. 检索相关历史 Episodes（最近 3 个会话）
  const recentEpisodes = await memoryService.search({
    scope:    'customer',
    subjectId: p.customerId,
    layers:   ['episodic'],
    topK:     3,
    sortBy:   'recency',
  });

  // 3. 注入到 Mastra Agent（通过 runtimeContext）
  agent.setRuntimeContext({
    slots:          wm,
    recentEpisodes,
    orgId:    p.orgId,
    brandId:  p.brandId,
  });

  // 4. 主动跟进 pending_items
  const pending = await memoryService.slotGet(p.customerId, 'pending_items');
  if (pending) await agent.queueGreeting(`上次说要跟进 ${pending}...`);
}
```

### 15.2 消息接收（MessageReceived）

Mastra Memory 在 `agent.stream(messages, { resourceId, threadId })` 中已自动完成「写入 L1 + 检索相关记忆」。KeenAI 仅在 Hook 中追加业务侧逻辑：

```ts
// apps/worker/src/jobs/memory-on-message-received.ts （承前 §6.1）
// 已展示完整 Inngest function 实现
```

### 15.3 出会话（SessionEnd / ConversationClosed）

```ts
// apps/worker/src/jobs/memory-consolidate.ts
import { inngest } from '@keenai/workflow/inngest';
import { generateObject } from 'ai';
import { z } from 'zod';
import { modelForRoute } from '@keenai/llm';

const EpisodeSummary = z.object({
  title: z.string(),
  summary: z.string(),
  topic: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  resolution: z.enum(['resolved', 'escalated', 'abandoned']),
  keyEvents: z.array(z.string()),
});
const ExtractedFacts = z.object({
  facts: z.array(z.object({ fact: z.string(), category: z.string(), confidence: z.number() })),
});

export const memoryConsolidate = inngest.createFunction(
  { id: 'memory-consolidate' },
  { event: 'conversation/closed' },
  async ({ event, step }) => {
    const { orgId, brandId, customerId, conversationId } = event.data;

    // 1. 取本会话所有 observation
    const obs = await step.run('load-observations', () =>
      memoryService.loadSession(orgId, customerId, conversationId),
    );

    // 2. LLM 总结 → 写 L2 Episode
    const ep = await step.run('summarize', () => generateObject({
      model:  modelForRoute('summarization'),
      schema: EpisodeSummary,
      prompt: serializeForSummary(obs),
    }));
    await step.run('persist-episode', () => memoryService.upsertEpisode({ ...ep.object, ... }));

    // 3. LLM 抽取事实 → 写 L3 Fact + 矛盾检测
    const facts = await step.run('extract-facts', () => generateObject({
      model:  modelForRoute('classification'),
      schema: ExtractedFacts,
      prompt: factExtractionPrompt(obs),
    }));
    for (const f of facts.object.facts) {
      await step.run(`fact-${f.fact}`, () => memoryService.upsertFactWithContradictionCheck(f));
    }

    // 4. 更新 Mastra workingMemory（Slots）
    await step.run('update-slots', () => memoryService.recomputeSlots(customerId));

    // 5. 重新嵌入 + KG 抽取（fan-out）
    await step.sendEvent('memory-fanout', [
      { name: 'memory/embed',     data: { entityType: 'episode', id: ep.object.id } },
      { name: 'memory/extract-kg', data: { conversationId } },
    ]);
  },
);
```

---

## 十六、性能与扩展

| 指标 | 目标 |
|------|------|
| L1 写入延迟 | < 10ms（同步）+ 异步嵌入 |
| 搜索 P95 | < 100ms（BM25 + Vector） |
| Profile 加载 | < 50ms（Redis 缓存） |
| Slot 读写 | < 5ms |
| 单租户 Memory 容量 | 100M observations |
| 巩固任务吞吐 | 1000 sessions/min |

### 16.1 缓存策略

```ts
// packages/memory/src/cache.ts
export const cacheConfig = {
  profile: {
    ttlSec: 300,
    invalidateOn: ['slot_update', 'fact_update'],
  },
  hotFacts: {
    ttlSec: 1800,
    keys: 'top_50_per_customer',
  },
  embeddings: {
    inProcessLru: 10_000,
  },
} as const;
```

实现：`ioredis` 缓存层 + `lru-cache`（in-process）。

### 16.2 扩展策略

- **分区**：observations / memory_audit 按月分区（PG 原生；LibSQL 通过 Inngest 月度归档 job 模拟）
- **冷热分层**：L1 老数据自动归档到对象存储（`@aws-sdk/client-s3` zstd 压缩）
- **读副本**：分析类查询走只读副本（LibSQL Embedded Replicas / PG read-replica）
- **向量库切换**：超大客户切到独立 Qdrant（替换 `VectorStore` 实现）

---

## 十七、对 AgentMemory 的借鉴清单

| AgentMemory 设计 | KeenAI 采纳 | KeenAI 调整 |
|------------------|-------------|-------------|
| 4-Tier 巩固 | ✅ | 按客户/团队/品牌多维度 |
| BM25+Vector+Graph + RRF | ✅ | 抽象 `FTSStore` + `VectorStore`（PG / LibSQL / Meili 可换） |
| Hook Pipeline | ✅ | 业务级 Hook，落地为 Inngest 事件总线 |
| Privacy Filter | ✅ | 增加中文 PII（身份证、手机号），落地为 Mastra Memory Processor |
| Memory Slots | ✅ | 业务化（preferences/pending），通过 Mastra `workingMemory.template` 渲染 |
| 4-tier Consolidation + Decay | ✅ | Ebbinghaus + 矛盾检测（`generateObject` 驱动） |
| Citation Provenance | ✅ | 每条记忆带 `sessionId` |
| Team Memory | ✅ | 按 Team / Brand / Member 命名空间 |
| Git Snapshots | 🔄 | 简化为版本号（按需快照） |
| Knowledge Graph + BFS | ✅ | 递归 CTE（PG / LibSQL 同源） |
| MCP Server 暴露 | ✅ | KeenAI 内置 MCP Host & Server（`@modelcontextprotocol/sdk`） |
| Real-time Viewer | ✅ | Dashboard 内置 Memory Explorer |
| Self-healing 断路器 | ✅ | LLM Provider Failover 已有 |
| Importance-based Eviction | ✅ | `evictionScore()` |
| Auto Compress hook | 🔄 | 默认 OFF（防 Token 失控），可开启 Mastra `TrajectoryCompressor` |

---

## 十八、与 Skill / KB / Workflow 的关系

```
                Memory ←─→ Skill
                  ↑          ↑
                  │          │
                  ↓          ↓
                Agent ──→ Workflow（Inngest）
                  ↓
                  KB
```

- **Memory → Skill**：「这个 Pattern 已被沉淀为流程」（L4 自动提议 Skill）
- **Skill → Memory**：「这个客户曾发生过什么」（Skill 决策时查 Memory）
- **KB ⟷ Memory**：并行检索（个人 vs 全局），由 Agent Context Assembler 合并
- **Workflow ⟶ Agent**：触发 Agent，Agent 同时用 Memory + KB + Skill

详见：
- [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md)
- [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)
- [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)
