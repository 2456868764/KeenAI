# KeenAI 系统架构设计（TypeScript 全栈）

## 一、总体架构

### 1.1 分层架构

```
┌────────────────────────────────────────────────────────────┐
│                       客户端层 Client                        │
│  Dashboard │ Portal │ Help Center │ Changelog │ Messenger   │
│   (Next.js 15)        (SSR/ISR)              (Preact Widget)│
└────────────────────────────────────────────────────────────┘
                              │ HTTPS / WSS
┌────────────────────────────────────────────────────────────┐
│                    接入层 Gateway / Edge                     │
│  Caddy / Traefik（自托管）· TLS · Rate Limit · WAF · Routing │
│  Cloudflare Workers（Edge：Widget API、防爬、限流）           │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│                      API 层 Service                          │
│           Hono（Bun 1.2+ · Node 22 LTS 兜底）                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐  │
│  │REST     │ │RPC/SSE  │ │WebSocket│ │ Admin   │ │Public│  │
│  │ + Zod   │ │ (Hono)  │ │ (Bun.   │ │  API    │ │Pages │  │
│  │OpenAPI  │ │ stream  │ │  serve) │ │         │ │      │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────┘  │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│                    业务层 Domain Services                    │
│  Inbox │ Conv │ Ticket │ Workflow │ AI │ Feedback │ Help    │
│  Channel │ Notify │ Auth │ User │ Brand │ Analytics │ ...   │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│                  异步任务层 Async Workers                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Workflow │ │  Email   │ │   AI     │ │ Crawler  │       │
│  │ (Inngest │ │  Worker  │ │  Worker  │ │  Worker  │       │
│  │ +BullMQ) │ │ (imapflow│ │ (RAG /   │ │ (crawlee)│       │
│  │          │ │  poller) │ │ Memory)  │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│             数据层 Data & Storage（接口抽象 + 双后端）        │
│  ┌─────────────────────────┬─────────────────────────────┐ │
│  │  Backend A: PostgreSQL  │  Backend B: LibSQL/SQLite   │ │
│  │  + pgvector + tsvector  │  + libsql_vector / vec0     │ │
│  │  Drizzle / postgres-js  │  + FTS5                     │ │
│  │                         │  Drizzle / @libsql/client   │ │
│  └─────────────────────────┴─────────────────────────────┘ │
│      Redis（可选） │ Meilisearch（可选）│ S3/R2/MinIO       │
└────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────┐
│                  外部依赖 External Services                  │
│  LLM Providers │ Email │ Slack │ Linear │ Jira │ MCP Servers│
└────────────────────────────────────────────────────────────┘
```

### 1.2 Modular Monolith + 插件化设计原则

KeenAI 采用 **「Modular Monolith + pnpm workspaces」** 架构（Monorepo + Domain Packages），早期以单进程部署降低运维门槛，后期可拆分独立服务（worker、edge、Embedding 微服务）。

**模块边界遵循 DDD Bounded Context**，每个领域独立 npm package（在 monorepo 内）：

```
keenai/
├── apps/
│   ├── api/           # Hono HTTP/WS 入口
│   ├── worker/        # Inngest/BullMQ worker 入口
│   ├── dashboard/     # Next.js 后台
│   ├── portal/        # Next.js 公开门户
│   ├── help-center/   # Next.js Help Center
│   ├── changelog/     # Next.js Changelog
│   └── widget/        # Preact + Vite Messenger
└── packages/
    ├── inbox/         # 收件箱
    ├── conversation/  # 对话生命周期
    ├── ticket/        # 工单
    ├── workflow/      # 工作流（Inngest 封装）
    ├── agent/         # AI Agent（Mastra）
    ├── memory/        # 记忆系统
    ├── kb/            # 知识库 / RAG
    ├── channels/      # 渠道适配（Messenger/Email/Slack/Discord）
    ├── feedback/      # 反馈中心
    ├── roadmap/       # 路线图
    ├── changelog/     # 更新日志
    ├── helpcenter/    # 帮助中心
    ├── user/          # 用户 / 组织 / Brand
    ├── notify/        # 通知
    ├── analytics/     # 分析
    ├── billing/       # 计费（云版）
    ├── auth/          # JWT/OAuth/SAML/HMAC
    ├── llm/           # LLM Provider 抽象（Vercel AI SDK 包装）
    ├── mcp/           # MCP Host & Server
    ├── storage/       # Store/VectorStore/FTSStore（双后端）
    ├── db/            # Drizzle schema + migrations
    └── shared/        # 跨前后端共享 Zod schemas / types / utils
```

> 关键收益：**`packages/shared`** 承载 Zod schema、类型、常量、工具函数；Drizzle schema → Zod → Hono → React 改一处全链报错。

---

## 二、技术栈选型

> 完整选型见 [06-TECH-STACK.md](06-TECH-STACK.md)，本节聚焦设计取舍。

### 2.1 后端

#### 语言：TypeScript 5.6+

**理由**：
- 端到端类型安全：Drizzle Schema → Zod → Hono → React 全链共享类型
- AI 生态贴合度最高：Vercel AI SDK、Mastra、`@modelcontextprotocol/sdk`、`@xenova/transformers` 均为 TS 一等公民
- 单语言：前后端、Agent、Worker、Widget 同语言，Solo 开发节奏最佳
- 部署灵活：Node / Bun / Cloudflare Workers / Vercel / Deno 同源运行

**对比放弃**：
- Go：性能与单二进制部署最优，但 AI 生态弱、跨前后端类型无法共享、Solo 开发需要双栈
- Rust：性能极致，开发速度慢、AI 生态弱
- Python：AI 生态最强，但前端、并发模型不友好

#### 运行时：Bun 1.2+（默认） · Node 22 LTS（兜底）

**理由**：
- 启动 < 100ms（Node ~500ms）；HTTP `RPS` ≈ Node 的 2 倍
- 内置 bundler / test runner / SQLite / 密码 hash，Solo 开发零配置
- `bun build --compile` 输出单二进制（~70MB），自托管极简
- ~99% Node 兼容；CI / 生产可同时验证 Node 22 LTS 避免单一 runtime 风险

#### HTTP 框架：Hono

**理由**：
- 跨 runtime（Bun / Node / Workers / Deno / D1）—— 同一份业务代码可同时跑在源站与 Edge
- 性能领先（Bun 上 ~180k RPS）
- 与 Zod / Vercel AI SDK 完美集成
- 内置 streaming（SSE / Web Streams），契合 LLM 流式

**对比**：
- Elysia：Bun-only，舍弃 Edge 灵活性
- Fastify：仅 Node，跨 runtime 弱
- NestJS：DI 太重，Solo 团队不适合

#### ORM：Drizzle ORM

**理由**：
- 双方言同源：PG / SQLite / LibSQL / Cloudflare D1 一份 schema
- 类型推断神器：schema 即类型，无 codegen
- 原生支持 pgvector（`vector({ dimensions: N })`）
- 包体 7.4KB gzip，Edge 友好
- Drizzle Kit 提供 migration + Studio 一站式

**对比放弃**：
- Prisma：rust 引擎重，Edge 适配需 Driver Adapter
- Kysely：纯 query builder，无向量原生支持

#### 工作流引擎：Inngest（默认） + BullMQ（重 Redis 队列）

**理由**（Inngest）：
- 事件驱动 Saga，Serverless 风格
- Step Function 内置（重试、暂停、Wait）
- TypeScript 原生，与 Hono 无缝
- 自托管开源 + 云版均可
- Solo 友好（Dashboard 飞快）

**BullMQ 用于**：
- 邮件批量发送、Embedding 批处理等纯队列场景
- 已熟悉 Redis 队列的项目兜底

**对比放弃**：
- Temporal TS SDK：功能强但 TS SDK 不及 Go 一流，Solo 开发太重
- Trigger.dev：优秀替代，可与 Inngest 互换

---

### 2.2 数据存储（可插拔双后端）

> KeenAI 数据层 **基于 TS 接口设计**，同时支持 PostgreSQL 与 LibSQL/SQLite。完整接口契约与实现细节见 [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)。

#### 抽象核心

```ts
// packages/storage/src/core
export interface Store {                    // 关系数据 + 事务 + Pub/Sub
  readonly dialect: Dialect;
  readonly db: DrizzleDb;
  transaction<T>(fn: (tx: TxScope) => Promise<T>, opts?: TxOptions): Promise<T>;
  listen<T>(channel: string, h: (msg: T) => unknown): Promise<Unsubscribe>;
  notify<T>(channel: string, payload: T): Promise<void>;
  ping(): Promise<void>; health(): Promise<Health>; close(): Promise<void>;
}
export interface VectorStore {              // 向量集合 + 检索 + 索引
  createCollection / upsert / delete / search / ensureIndex
}
export interface FTSStore {                 // 全文索引 + 检索 + 高亮 + Facet
  createIndex / upsert / delete / search
}
export type Expr = /* 跨方言查询过滤 DSL */;
```

业务代码只依赖接口，**不直接拼写方言 SQL**。

#### 双后端实现矩阵

| 能力 | Backend A：PostgreSQL 16+ | Backend B：LibSQL / SQLite 3.45+ |
|------|----------------------------|-----------------------------------|
| Driver / ORM | `postgres-js` + `drizzle-orm/postgres-js` | `@libsql/client` + `drizzle-orm/libsql` （或 `better-sqlite3`） |
| 事务 / 嵌套事务 | 原生 + SAVEPOINT | 原生 + SAVEPOINT |
| 向量 | [`pgvector`](https://github.com/pgvector/pgvector) + HNSW / IVFFlat | **LibSQL `libsql_vector`** 内置 HNSW / [`sqlite-vec`](https://github.com/asg017/sqlite-vec) `vec0` + partition key |
| 全文 | `tsvector + GIN`（zhparser） 或 Meilisearch 外置 | `FTS5` 虚拟表（nodejieba 预分词） 或 Meilisearch 外置 |
| JSON | `jsonb` + GIN | `json_extract` / JSON1 |
| 分区 | 声明式 `PARTITION BY RANGE` | 应用层归档（单表 + 索引） |
| Pub/Sub | `LISTEN/NOTIFY` | InMemory / **Redis（推荐生产）** |
| HA / 备份 | Patroni · WAL-G · 物理复制 | **LibSQL Embedded Replicas** / [Litestream](https://litestream.io) 实时增量到 S3 |
| 并发写 | 高（MVCC） | WAL 模式 1 writer，应用层串行化 |
| 推荐场景 | SaaS 云版 · 中大型团队 · 多区域 | 自托管 · Indie · Edge · CI · 本地开发 |
| 容量上限 | 千万级向量 / 100M+ 行 | 百万级向量 / 50K 客户 |

> 一键迁移：`bunx keenai migrate-backend --from libsql --to postgres --verify-vectors`

#### 缓存 / 队列 / Pub/Sub：Redis 7+（推荐）

- 会话缓存、Rate Limit、BullMQ 队列、WebSocket 跨节点广播
- Inngest 也可承担队列与事件总线职责（与 Redis 互补）
- **Lite 模式可省**：单机自托管时降级为内存 cache + 本地队列（写入 LibSQL/SQLite 表）

#### 全文搜索

| 阶段 | 默认 | 可选 |
|------|------|------|
| Day-1（开箱） | 内嵌（PG `tsvector` / LibSQL `FTS5`） | — |
| Day-100（规模） | 外置 [Meilisearch](https://www.meilisearch.com/) | Typesense / Elasticsearch（不推荐） |

Meilisearch 优势：中文友好、性能优于 ES（资源 1/10）、单二进制、Typo Tolerance、Faceted Search。

#### 向量数据库

| 阶段 | PG 路线 | LibSQL/SQLite 路线 |
|------|---------|---------------------|
| Day-1 | pgvector（同库） | LibSQL `libsql_vector` / sqlite-vec（同库） |
| Day-100 | pgvector + HNSW 调优 | 升级到 PG 或外置 Qdrant / Milvus |
| 海量 | 切 [Qdrant](https://qdrant.tech/) / Milvus 集群 | 同上 |

`VectorStore` 接口屏蔽差异，业务无感切换。

#### 对象存储：S3 API 兼容

- 生产：AWS S3 / Cloudflare R2 / 阿里云 OSS
- 自托管：MinIO（Standard profile）/ 本地文件系统（Lite profile）

---

### 2.3 AI / LLM 层（AI Kernel）

KeenAI 的 AI 内核由 **三个深度耦合但职责清晰** 的子系统组成，分别承担「执行」「记忆」「知识」三件事。**底层统一基于 [Mastra](https://mastra.ai/) + [Vercel AI SDK](https://sdk.vercel.ai/) 实现**。

```
┌──────────────────────────────────────────────────────────────────┐
│                       AI Kernel 全景                              │
│                                                                   │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│   │  Agent Engine   │◀──▶│  Memory System  │    │  KB / RAG    │ │
│   │  (Keeni Agent)  │    │  (Keeni Memory) │    │  (Hybrid     │ │
│   │  Mastra Agent   │    │  Mastra Memory  │    │  Retrieval)  │ │
│   │                 │    │                 │    │  @mastra/rag │ │
│   │  执行：Plan→Act │    │  记忆：4 层巩固 │    │  知识：       │ │
│   │  →Observe→      │    │  Working /      │    │  BM25+Vec+   │ │
│   │  Reflect        │    │  Episodic /     │    │  Graph + RRF │ │
│   │                 │    │  Semantic /     │    │              │ │
│   │  + Skill 自学习 │    │  Procedural     │    │  + Reranker  │ │
│   │  + Subagent     │    │                 │    │  + Contextual│ │
│   │  + MCP Host/Srv │    │  + Hook Pipeline│    │   Retrieval  │ │
│   │  + Multi-LLM    │    │  + Memory Slots │    │  + 多源接入  │ │
│   │    Failover     │    │  + KG + Decay   │    │  + Eval      │ │
│   └────────┬────────┘    └────────┬────────┘    └──────┬──────┘ │
│            │                       │                     │       │
│            └───────────┬───────────┴─────────────────────┘       │
│                        ▼                                          │
│           ┌──────────────────────────┐                            │
│           │   Context Assembler       │                            │
│           │  (Token Budget · 引用)    │                            │
│           └──────────────────────────┘                            │
│                        │                                          │
│                        ▼                                          │
│           ┌──────────────────────────┐                            │
│           │  Vercel AI SDK            │                            │
│           │  streamText / generateText│                            │
│           │  + tool() + 20+ Provider  │                            │
│           └──────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

> 设计参考：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（Agent 执行核心、Skill 自学习、多平台 Gateway、Subagent 并行）+ [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)（4 层记忆、Hook Pipeline、三流 RRF 检索）。落地框架 [Mastra](https://mastra.ai/) 已经把 Agent + Memory + Workflow + RAG + Eval + MCP 封装到位。本地克隆与读码入口见 [00-REFERENCE-REPOS.md](00-REFERENCE-REPOS.md)。

详细设计：
- **执行核心** → [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md)
- **记忆系统** → [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md)
- **知识库 / RAG** → [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)

#### LLMProvider 抽象（多模型 · 不绑定）

底层走 **Vercel AI SDK v4**，KeenAI 在其上再抽一层 `LLMProvider`，便于路由 / 计费 / Failover：

```ts
// packages/llm/src/provider.ts
import type { LanguageModelV1, EmbeddingModelV1 } from 'ai';

export interface LLMProvider {
  readonly name: string;
  capabilities(): Capabilities;                 // contextWindow / streaming / tools / vision / reasoning
  chat(model: string): LanguageModelV1;         // 返回 ai SDK 兼容 model
  embed(model: string): EmbeddingModelV1;
  rerank?(query: string, docs: string[]): Promise<Score[]>;   // 可选
  pricing(): PricingInfo;
  healthCheck(): Promise<boolean>;
}

// 业务侧统一调用
import { streamText } from 'ai';
const result = await streamText({
  model: registry.chat('openai/gpt-5'),         // 注册表里挑模型
  messages,
  tools: { weather, search_kb, create_ticket },
});
```

**内置 Provider 矩阵**：OpenAI · Anthropic · Gemini · DeepSeek · 智谱 GLM · Moonshot · MiniMax · 通义 Qwen · Xiaomi MiMo · OpenRouter（200+ 聚合）· Ollama（本地）· vLLM · LM Studio · NovitaAI · Hugging Face Inference

> 国内 / 自部署模型统一通过 `@ai-sdk/openai-compatible` 一行接入。

**Failover Chain（参考 Hermes）**：主 Provider 失败 → 自动降级（如 OpenAI → Anthropic → 本地 Ollama）。

**模型路由（按场景）**：快速回复用 `gpt-5-mini` / `claude-haiku`，复杂推理切 `deepseek-r1`，长文档切 `moonshot-128k`，本地嵌入用 `Xenova/bge-m3`。

#### 三大子系统简表

| 子系统 | 一句话定位 | 核心数据结构 | 主要存储 | 落地包 |
|--------|-----------|--------------|----------|--------|
| **Agent Engine** | 「Plan-Act-Observe-Reflect」主循环，让 LLM 能干活 | Conversation / UserAgent / Brand State | Redis + Store | `@mastra/core` + `ai` |
| **Memory System** | per-Customer 个体记忆，让 Agent 「记住人」 | Observations / Episodes / Facts / Patterns / Slots | VectorStore + FTSStore + Store | `@mastra/memory` + `@keenai/memory` |
| **KB / RAG** | per-Brand 集体知识，让 Agent 「答得准」 | Sources / Documents / Chunks / Entities | VectorStore + FTSStore + Store + S3 | `@mastra/rag` + `@keenai/kb` |

#### 检索范式：三流融合（Triple-stream Retrieval）

Memory 和 KB **共享同一套检索引擎**，避免重复实现：

```
                Query
                  │
   ┌──────────────┼──────────────┐
   ▼              ▼              ▼
 BM25         Vector          Graph
(FTSStore)   (VectorStore)  (relations)
 │ PG: tsvector / Meili      │ PG: relations table
 │ LibSQL: FTS5              │ LibSQL: relations table
 │ pgvector / libsql_vector  │ 递归 CTE
   │              │              │
   └──────┬───────┴──────┬──────┘
          ▼              ▼
      RRF Fusion (k=60)
   + Confidence Weight
   + Recency Boost
   + Diversifier (max per source)
          │
          ▼
       Rerank
   (@xenova/transformers bge-reranker / Cohere / Jina)
          │
          ▼
        Top-K
```

#### Tool Calling / Custom Action / MCP

- **Tool Calling**：Vercel AI SDK `tool({ description, parameters: z.object({...}), execute })` 一等公民，Zod 校验，失败自动重试 + 降级
- **MCP 双向**：KeenAI 既是 MCP Host（消费 AgentMemory、Context7、Brave Search 等外部 MCP），也是 MCP Server（暴露 `keenai_search_help`、`keenai_create_ticket` 等工具给外部 Agent / IDE）。基于 `@modelcontextprotocol/sdk` + `@mastra/mcp`
- **Custom Actions**：业务方自定义 HTTP 工具，多种 Sandbox（HTTP Direct / Docker / WASM / **Cloudflare Workers** / [`isolated-vm`](https://github.com/laverdet/isolated-vm)）

#### Workflow + AI 集成

```
Workflow Step: "Let Keeni Agent answer"
  ↓
Agent Orchestrator (per-Conversation)
  ├─ Personality（品牌人格 + 风格）
  ├─ Context Assembler（自适应 Token 预算 + 轨迹压缩）
  │     ├─ Memory.search → Slots + Episodes + Facts
  │     └─ KB.search → Hybrid Retrieval + Rerank
  ├─ Agent Loop（Plan-Act-Observe-Reflect, 多轮 iteration）
  │     ├─ LLM Provider Registry（含 Failover）
  │     └─ Tool Executor（并行 + MCP）
  ├─ Streaming Response → SSE / WebSocket → Client
  └─ Post-Run（异步 · Inngest function）
        ├─ Memory.Consolidate（L1→L2→L3→L4）
        └─ Skill.Refine（自改进 + A/B）
```

---

### 2.4 前端

#### Dashboard：Next.js 15 + React 19

- App Router（RSC + Server Actions + Streaming）
- TypeScript 严格模式
- **UI 库**：Shadcn/ui + Radix Primitives（无依赖、可定制）
- **样式**：Tailwind CSS v4
- **状态**：Zustand（客户端）+ TanStack Query（服务端）
- **表单**：React Hook Form + Zod
- **编辑器**：Tiptap v3
- **图表**：Apache ECharts（中文友好）
- **命令面板**：cmdk
- **i18n**：next-intl
- **AI UI**：`@ai-sdk/react`（`useChat` / `useCompletion`）— 与后端 Vercel AI SDK 流式无缝
- **实时**：[`partysocket`](https://github.com/partykit/partysocket)（WS 自动重连、tab 唤醒）

#### Portal / Help Center / Changelog：Next.js 15

- 公开页面采用 SSR + ISR
- SEO 友好（Sitemap、OG、Schema.org）
- 多语言路由（`/zh`、`/en`、`/ja`）
- 自定义域名通过 Caddy 动态证书 + SNI

#### Messenger Widget：Preact + Vite

**为什么 Preact 不 React**：
- 包体 3KB vs React 45KB
- 嵌入第三方网站，对包体敏感
- API 兼容 React，复用大部分组件

**架构**：
- 单一 `widget.js`（`vite-plugin-singlefile`）通过 `<script>` 嵌入
- Shadow DOM 隔离 CSS / JS（不污染宿主页样式）
- PostMessage 与宿主页通信
- WebSocket 直连 KeenAI 后端 / Cloudflare Worker Edge

#### 移动端：React Native（Expo）

- 后期版本
- 与 Web 共享部分组件（Solito）+ 共享 Zod schema（`packages/shared`）

---

### 2.5 邮件子系统

#### 出站邮件
- SMTP（任意 Provider：SES、SendGrid、MailGun、Resend、Postmark）
- 模板引擎：**[MJML](https://mjml.io/)** + React Email
- 队列：**BullMQ**（重试、限流）
- DKIM/SPF/DMARC 配置文档

#### 入站邮件
- **方案 A**：IMAP 拉取（[imapflow](https://imapflow.com/)）—— 适合小用量；Inngest cron 每 30s 触发
- **方案 B**：自建 Postal —— 适合自托管全功能
- **方案 C**：Webhook 接收（SendGrid Inbound / Mailgun Routes / Resend Webhook）—— 云版

#### 邮件解析
- [mailparser](https://nodemailer.com/extras/mailparser/) 解析多部分邮件
- 提取附件 → S3
- 引用历史剥离（Gmail/Outlook 兼容）
- 邮件线程 Threading（Message-ID + In-Reply-To）

---

### 2.6 实时通信

```
                ┌───────────┐
                │  Client   │
                └─────┬─────┘
                      │ WSS
                ┌─────┴─────┐
                │  Gateway  │ ── Sticky Session（用户 ID 哈希）
                └─────┬─────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   ┌────┴───┐    ┌────┴───┐    ┌────┴───┐
   │ WS Node│    │ WS Node│    │ WS Node│  ── Bun.serve 水平扩展
   │(Bun ws)│    │(Bun ws)│    │(Bun ws)│
   └────┬───┘    └────┬───┘    └────┬───┘
        │             │             │
        └─────────────┼─────────────┘
                      │
                ┌─────┴─────┐
                │   Redis   │ ── Pub/Sub 跨节点广播
                │  Pub/Sub  │
                └───────────┘
```

**消息流**：
1. 客服 A 发消息 → API（Hono on Bun）写入 Store → Redis Publish `conv:{id}` 事件
2. 所有订阅 `conv:{id}` 的 WS 节点收到事件
3. 节点查询本地连接表 → 推送给在线客户端

**Edge 加速**：Widget 首屏与「正在输入」轻量事件可走 Cloudflare Workers + Durable Objects（每对话一个 DO 实例），减少回源延迟。

---

### 2.7 多租户

#### 隔离级别

| 数据类型 | 隔离方式 | 理由 |
|----------|---------|------|
| 业务数据 | `tenant_id` 列过滤（Drizzle helper 强制注入） | 共享 schema，运维简单 |
| 上传文件 | S3 路径前缀 `org_{id}/...` | 简单 |
| 向量数据 | PG：`WHERE org_id =` + 复合索引；LibSQL：`WHERE org_id =`；sqlite-vec：`partition key` | 原生支持 |
| 搜索索引 | Meilisearch 每租户独立 Index / PG 单表 + 过滤 / LibSQL 单库 + 过滤 | 性能 + 安全 |
| 缓存 | Redis Key 前缀 `org:{id}:...` | 简单 |
| 自定义域名 | Caddy 动态证书 + SNI | 灵活 |

> 通过 `packages/shared/with-tenant.ts` 提供 `withTenant(orgId, brandId, fn)` helper，Drizzle 查询自动注入 `WHERE org_id = ...`，避免业务忘记带租户条件。

#### 大客户单独部署
企业版支持 Dedicated Instance，独立 PG/Redis/S3。

---

### 2.8 部署架构

#### 开发环境（Docker Compose）

```yaml
# Lite profile（默认，单容器 Bun + LibSQL）：
services:
  keenai-lite:   # Bun 单进程 + LibSQL + libsql_vector + FTS5（内嵌）
  litestream:    # 实时增量备份到 S3（可选）

# Standard / Full profile：
services:
  postgres:      # PostgreSQL 16 + pgvector
  redis:         # Redis 7
  meilisearch:   # 全文搜索
  minio:         # S3 兼容存储
  mailcatcher:   # 邮件调试
  ollama:        # 本地 LLM（可选）
  inngest:       # Inngest 自托管（full only）
  api:           # KeenAI Hono Backend（Bun）
  worker:        # 异步任务（Bun）
  dashboard:     # Next.js 15
  portal:        # 公开页面
  widget-cdn:    # Messenger Widget 单文件 CDN
```

#### 生产环境（K8s）

```
┌─────────────────────────────────────────┐
│           Ingress (Traefik / Nginx)      │
└─────────────────────────────────────────┘
         │
    ┌────┼────┬────────┬─────────┐
    │    │    │        │         │
  API   WS  Worker  Dashboard  Portal
   x3   x3   x2       x2         x2
   (Bun)(Bun)(Bun)  (Next.js)  (Next.js)
    │    │    │
    └────┴────┴────────────────────┐
                                    │
       ┌──────┬──────┬───────┬─────┴─┐
       PG   Redis  Meili   S3 / R2  Inngest
     (HA)   Cluster                 (Cloud or Self-host)
```

**Helm Chart 提供**：
- 一键安装
- HPA 水平扩展（按 QPS / 队列深度）
- ServiceMonitor（Prometheus）
- PVC 持久化

#### Edge / Serverless 部署（可选）

```
Edge:    Cloudflare Workers / Pages（Widget API、Embed Loader）
Web:     Vercel（Dashboard / Portal / Help / Changelog）
API:     Fly.io / Railway / Render（Hono + Bun container）
Queue:   Inngest Cloud
DB:      Supabase / Neon / Turso（LibSQL 同源）
Vector:  pgvector / Turso 向量 / Qdrant Cloud
```

> 同一份代码无需修改即可同时跑「自托管单机 Bun + LibSQL」与「Vercel + Neon + Inngest Cloud」。

---

## 三、核心数据流

### 3.1 客户发消息流（Messenger）

```
Customer → Widget JS（Preact in Shadow DOM）
  ↓ WSS（或 Cloudflare Workers Edge 转发）
KeenAI WS Gateway（Bun.serve / Hono）
  ↓ 路由
Conversation Service
  ├─ 写消息 → Store（PG or LibSQL）
  ├─ 更新 Conversation 元数据
  ├─ 触发 Inngest 事件 `conversation/message.created`
  │     ↓
  │   Inngest function（持久化、可重试）
  │     ├─ Branch 路由（基于规则 / Workflow）
  │     ├─ Let Keeni Answer → Agent Service
  │     │     ├─ Memory.search + KB.search
  │     │     ├─ Mastra Agent + Vercel AI SDK streamText
  │     │     └─ 流式回写消息 → Conversation + WS
  │     └─ 或 Assign 到 Team
  ├─ Redis Publish `conv:{id}` 事件
  ↓
所有客服端 WS 节点推送
```

### 3.2 邮件入站流

```
Email Provider
  ↓ (IMAP poll / Webhook / Postal SMTP)
Email Ingestor Worker（Bun + imapflow + Inngest cron）
  ├─ 解析 MIME（mailparser）
  ├─ Threading（Message-ID 匹配）
  ├─ 附件上传 S3
  ├─ 查找或创建 User/Conversation
  ├─ 写入 Message
  └─ 触发 Inngest 事件 `conversation/message.created`（复用 3.1 流程）
```

### 3.2.1 多模态消息流（Inbound / Outbound）

> 完整设计见 [14-MULTIMODAL.md](14-MULTIMODAL.md)。与 Hermes Gateway 对照：`MessageEvent` → S3 缓存 → Agent enrichment → `ChannelRenderer` 出站。

```
Inbound（客户/渠道 → Store）
  Widget / Email / IM
    → Channel Normalizer（MIME 校验 · 下载）
    → upload → attachments.storageKey
    → insertMessage { parts[], plainText, messageKind }
    → Inngest media.*（STT · thumbnail · vision_summary）
    → Copilot / Keeni：native vision 或 text enrichment

Outbound（Agent / 客服 / Workflow → 客户）
  OutboundPart[] 或 Markdown（MEDIA: / ![img]）
    → parseAgentResponse
    → ChannelRenderer（Widget bubble · Email MIME · IM sendPhoto/sendVoice）
    → insertMessage + attachments · WS push
```

### 3.3 AI Custom Action 调用

```
Inngest function "Let Keeni Answer"
  ↓
Agent Service 生成 Tool Call（Vercel AI SDK `tool()`）
  ↓ 选择 Action
Custom Action Executor
  ├─ 注入上下文变量（{{userId}} 等）
  ├─ HTTP Request（带 HMAC 签名）/ Workers 沙箱 / isolated-vm
  ├─ Zod 校验响应 Schema
  ├─ 响应大小检查（< 20KB）
  ├─ 字段过滤（Data Access 配置）
  ↓
Agent Service 整合结果（继续 AI SDK loop）
  ↓
生成自然语言回复
  ↓
Conversation Service 写消息 + 流式推送
```

### 3.4 Workflow 执行（Inngest）

```
Trigger Event（HTTP / Webhook / Cron / Domain Event）
  ↓
Inngest Engine
  ├─ 持久化 Workflow State（自动）
  ├─ 顺序执行 Steps（每 step 都是可重试的原子单元）
  │   ├─ step.run('branch', ...)              // 条件评估
  │   ├─ step.run('send-message', ...)        // 写 DB
  │   ├─ step.run('let-keeni-answer', ...)    // 调 Agent
  │   ├─ step.sleep('wait-1h', '1h')          // Timer
  │   ├─ step.waitForEvent('user-reply', ...) // 等待外部事件
  │   ├─ step.run('http-request', ...)        // 自定义 API
  │   └─ ...
  └─ 状态变更通知（Webhooks / Domain Events）
```

---

## 四、性能与扩展性目标

| 指标 | 单实例目标 | 水平扩展目标 |
|------|-----------|-------------|
| API QPS | 3,000（Hono on Bun） | 30,000 |
| WebSocket 并发 | 20,000（单 Bun 进程） | 100,000+ |
| 消息写入 | 800/s | 8,000/s |
| AI 检索 | 100/s | 1,000/s |
| 启动时间 | < 1s（Bun） | - |
| 内存占用（空载） | < 200MB（Bun） | - |
| 单二进制体积 | ~70MB（`bun build --compile`） | - |

> 与 Go 单实例的差距：WebSocket 并发约为 Go 的 1/5，但通过 N+1 节点 + Redis Pub/Sub 可线性扩展。CPU 密集场景（PDF 批量解析）建议下放给独立 Bun Worker 或 Python 微服务。

---

## 五、安全设计

### 5.1 认证
- **客服端**：JWT（Access 15min + Refresh 7d）—— `jose`
- **客户端**：Session Cookie + CSRF Token
- **Widget**：HMAC userHash 验证（验证字符串签名）
- **API**：API Key + OAuth 2.0
- **SSO**：SAML 2.0（`@node-saml/node-saml`）+ OIDC

### 5.2 授权
- RBAC：Role → Permission → Resource（[Casbin.js](https://github.com/casbin/node-casbin)）
- 字段级权限（敏感字段）—— Zod schema 投影
- API 限流（IP + UserID + APIKey 维度）—— Hono middleware

### 5.3 数据安全
- 静态加密：DB 字段级加密（敏感字段 · `crypto.subtle`）
- 传输加密：全链路 TLS 1.3
- 密钥管理：Vault / KMS / Cloudflare Secrets
- 备份加密：S3 SSE-KMS

### 5.4 审计
- 所有写操作记录 Audit Log
- 包含：actor、action、resource、IP、UA、时间
- 不可篡改（Append-only · 月度分区表 / SQLite 月度轮转）

### 5.5 防护
- WAF（Web Application Firewall · Cloudflare）
- Rate Limiting（Hono middleware + Redis）
- DDoS Protection（Cloudflare）
- SQL Injection（Drizzle 参数化绑定）
- XSS（前端 `sanitize-html` + CSP）
- CSRF（Hono `csrf()` middleware）
- 沙箱执行（Custom Action 用 `isolated-vm` / Workers / Docker）

---

## 六、可观测性

```
应用层
  ├─ Metrics → prom-client → Prometheus → Grafana Dashboard
  ├─ Tracing → @opentelemetry/sdk-node → Jaeger / Tempo
  ├─ Logs → pino → Loki → Grafana
  └─ Errors → Sentry（@sentry/node 自托管或 SaaS）

AI 专属
  ├─ Vercel AI SDK `experimental_telemetry: { isEnabled: true }` 自动埋点
  ├─ Mastra 内置 OTel + Eval 评分
  └─ LLM Token / Cost 计费追踪（@keenai/llm 中间层）

业务指标
  ├─ AI Resolution Rate
  ├─ Response Time (P50/P95/P99)
  ├─ Active Conversations
  ├─ Email Delivery Rate
  └─ Inngest Workflow Success Rate

告警
  ├─ Alertmanager
  ├─ 通道：Slack / Discord / Email / Webhook
  └─ PagerDuty（生产）
```

---

## 七、技术决策记录（ADR 摘要）

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | **TypeScript** | 前后端一致 · AI 生态 · 端到端类型 |
| 运行时 | **Bun 1.2+** （兜底 Node 22 LTS） | 启动快 · 内置多 · 单二进制 |
| HTTP 框架 | **Hono** | 跨 runtime · streaming · Zod 集成 |
| ORM | **Drizzle ORM** | 双方言同源 · pgvector 原生 · 无 codegen |
| 主数据库 | PostgreSQL 16 / LibSQL（SQLite）双后端 | 接口抽象，按规模选；自托管首选 LibSQL |
| 向量检索 | pgvector / libsql_vector / sqlite-vec | 一库多用，无独立向量集群 |
| 搜索引擎 | tsvector / FTS5（内嵌）or Meilisearch（生产） | 弹性配置 |
| Workflow / Queue | **Inngest + BullMQ** | 事件驱动 · Serverless 友好 · TS 一流 |
| Agent 编排 | **Mastra** | Agent + Memory + Workflow + Eval + MCP 一体化 |
| LLM SDK | **Vercel AI SDK v4** | 20+ Provider · streaming · tool 一等公民 |
| MCP | **`@modelcontextprotocol/sdk`** | 官方 TS SDK · 与 Mastra 原生集成 |
| 本地推理 | **`@xenova/transformers`** | 无 Python 微服务 · 浏览器 + Node + Bun |
| 前端 | Next.js 15 + React 19 | SSR · RSC · 生态 |
| UI 库 | Shadcn/ui | 无依赖 · 可定制 |
| Widget | Preact + Shadow DOM | 包体小 · 隔离 |
| Lint+Format | **Biome** | 单工具 · Rust · 飞快 |
| 测试 | **Vitest + Playwright** | 现代标准 |
| 部署 | Docker Compose（Lite/Standard/Full）+ Helm + Edge | 自托管 + K8s + Cloudflare/Vercel |
| License | AGPLv3 | 防 SaaS 套壳 |
| 多租户 | 共享 Schema + tenant_id | 运维简单 |
