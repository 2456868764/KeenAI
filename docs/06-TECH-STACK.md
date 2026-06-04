# KeenAI 技术栈选型详解（TypeScript 全栈）

> 🟦 **设计立场**：KeenAI 采用 **TypeScript 全栈**（前后端、Agent、Worker、Widget 同语言）。目标场景为 AI-first SaaS 创业 / Indie / Solo 开发，强调单语言一致性、AI 生态贴合度、端到端类型安全与极简部署体验。

---

## 一、技术选型总览

```
┌─────────────────────────────────────────────────────────────┐
│                  前端 Frontend（TS / React）                  │
├──────────────────┬──────────────────┬───────────────────────┤
│ Dashboard        │ Public Pages     │ Messenger Widget      │
│ Next.js 15       │ Next.js 15 SSR   │ Preact + Vite         │
│ React 19         │ ISR + RSC        │ Shadow DOM            │
│ Shadcn/ui        │ next-mdx-remote  │ @preact/signals       │
│ Tailwind v4      │ next-sitemap     │                       │
│ TanStack Query   │ next-seo         │                       │
│ Tiptap v3        │                  │                       │
│ cmdk             │                  │                       │
│ React Flow       │                  │                       │
│ ECharts          │                  │                       │
└──────────────────┴──────────────────┴───────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              网关 Gateway / Edge                              │
│       Caddy / Traefik （自托管）                              │
│       Cloudflare Workers（Edge：Widget API、防爬）            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              后端 Backend（TypeScript · Bun-first）           │
├─────────────────────────────────────────────────────────────┤
│ 运行时：Bun 1.2+（默认）· Node 22 LTS（兜底）                  │
│ 框架：Hono（HTTP/WS/SSE/Streaming）                          │
│ ORM：Drizzle ORM（PG / SQLite / LibSQL / D1 同源）             │
│ 存储抽象：Store / VectorStore / FTSStore TS 接口（双后端）      │
│ Agent 编排：Mastra（agent + memory + workflow + eval + MCP）   │
│ LLM SDK：Vercel AI SDK v4（多 Provider 一行切换）              │
│ MCP：@modelcontextprotocol/sdk（Host + Server 双向）           │
│ 工作流 / 队列：Inngest（事件驱动）+ BullMQ（重 Redis 队列）     │
│ 多模态消息：MessagePart + attachments · [14-MULTIMODAL.md](14-MULTIMODAL.md) │
│ Memory Tree：seal pipeline · [15-MEMORY-TREE.md](15-MEMORY-TREE.md) │
│ 验证：Zod（跨前后端共享 schema）                                │
│ 日志：pino                                                   │
│ 配置：c12（unjs 生态）                                        │
│ 测试：Vitest + Playwright                                    │
│ Lint+Format：Biome（Rust，单工具）                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              数据 Data Layer（可插拔双后端）                  │
├─────────────────────────────────────────────────────────────┤
│   ┌────────────────────────┐  ┌─────────────────────────┐   │
│   │ Backend A：PostgreSQL  │  │ Backend B：SQLite/LibSQL │   │
│   │  16+ (SaaS / 团队)      │  │  (Indie / Edge / Lite)  │   │
│   │  + pgvector (HNSW)     │  │  • LibSQL（默认/推荐）    │   │
│   │  + tsvector + GIN      │  │    含向量、HTTP API、     │   │
│   │  + pg_trgm             │  │    embedded replicas    │   │
│   │  + Patroni HA          │  │  • better-sqlite3 +     │   │
│   │                        │  │    sqlite-vec（兜底）    │   │
│   │  Driver: postgres-js   │  │  + FTS5 + JSON1         │   │
│   │  Drizzle: pg-core      │  │  Drizzle: libsql/sqlite │   │
│   └────────────────────────┘  └─────────────────────────┘   │
│   ┌────────────────────────┐  ┌─────────────────────────┐   │
│   │ Redis 7（缓存/队列/PubSub）│ Meilisearch（可选 FTS 加强）│ │
│   └────────────────────────┘  └─────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ S3 兼容对象存储（@aws-sdk/client-s3 / minio / 本地 fs） │ │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

> 接口契约与双后端实现细节见 [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)
                              │
┌─────────────────────────────────────────────────────────────┐
│                AI / LLM Layer                                │
├──────────────────────┬──────────────────────────────────────┤
│ Vercel AI SDK v4     │ OpenAI / Anthropic / Gemini /        │
│   • streamText       │ DeepSeek / 智谱 / Moonshot /          │
│   • generateText     │ Ollama / OpenRouter / NovitaAI       │
│   • toolCalling      │ Mastra Agent / Mastra Memory         │
│   • UI streaming     │ @modelcontextprotocol/sdk            │
│   • 20+ provider     │ @xenova/transformers（本地 embedding）│
└──────────────────────┴──────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              可观测性 Observability                           │
│  OpenTelemetry JS · pino · Prometheus · Grafana · Loki       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    部署 Deployment                           │
│  Bun build --compile（单二进制 ~70MB） · Docker Compose       │
│  Cloudflare Workers（Edge）· Vercel · Fly.io · Railway · K8s │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、Monorepo 结构

> **仓库布局**：下列目录位于 KeenAI **仓库根目录**（`apps/`、`packages/`），与 Turborepo / pnpm workspace 默认约定一致。

```
keenai/
├── apps/
│   ├── api/                  # Hono 后端（Bun runtime）
│   │   └── src/
│   │       ├── index.ts      # Hono app entry
│   │       ├── routes/       # REST 路由（conversations / tickets / ai）
│   │       ├── ws/           # WebSocket handlers
│   │       └── middleware/
│   ├── worker/               # 后台任务进程（BullMQ + Inngest）
│   │   └── src/
│   │       ├── memory.ts     # Memory 巩固
│   │       ├── kb-ingest.ts  # KB 摄入
│   │       ├── email-poll.ts # IMAP 拉取
│   │       └── cron.ts       # 定时
│   ├── dashboard/            # Next.js 15 后台
│   ├── portal/               # Next.js 反馈门户
│   ├── help-center/          # Next.js Help Center
│   ├── changelog/            # Next.js Changelog
│   └── widget/               # Preact + Vite Messenger
├── packages/
│   ├── db/                   # Drizzle schema + migrations（双方言）
│   │   ├── schema/
│   │   └── migrations/
│   ├── storage/              # Store/VectorStore/FTSStore 接口 + 实现
│   │   ├── core/             # 接口与契约测试
│   │   ├── postgres/         # PG 实现
│   │   └── libsql/           # LibSQL/SQLite 实现
│   ├── agent/                # Keeni Agent Engine（Mastra 包装）
│   ├── memory/               # Keeni Memory（4 层巩固）
│   ├── kb/                   # RAG / KB（hybrid retrieval）
│   ├── llm/                  # LLM Provider 抽象（Vercel AI SDK 包装）
│   ├── mcp/                  # MCP Host & Server
│   ├── workflow/             # Workflow（Inngest 封装）
│   ├── channels/             # Messenger/Email/Slack/Discord adapters
│   ├── auth/                 # JWT/OAuth/SAML/HMAC
│   ├── shared/               # Zod schemas、types、utils（跨前后端共享）
│   └── ui/                   # 共享 UI 组件 + Storybook（@keenai/ui）
├── tooling/
│   ├── biome.json            # Biome 配置（lint + format）
│   ├── tsconfig/
│   └── tailwind-config/
├── infra/
│   ├── docker/               # Dockerfile（lite / standard / full）
│   ├── compose/              # docker-compose 多 profile
│   ├── helm/                 # K8s Helm chart
│   └── inngest/              # Inngest functions 定义
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 三、后端依赖清单

### 3.1 核心 `package.json`（apps/api）

```json
{
  "name": "@keenai/api",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --compile --outfile dist/keenai",
    "test": "vitest",
    "lint": "biome check ."
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/zod-validator": "^0.4.0",
    "@hono/node-server": "^1.13.0",

    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "pgvector": "^0.2.0",
    "@libsql/client": "^0.14.0",
    "better-sqlite3": "^11.3.0",
    "sqlite-vec": "^0.1.6",

    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/google": "^1.0.0",
    "@ai-sdk/deepseek": "^0.1.0",
    "@ai-sdk/openai-compatible": "^0.1.0",
    "ollama-ai-provider": "^1.2.0",

    "@mastra/core": "^0.10.0",
    "@mastra/memory": "^0.10.0",
    "@mastra/libsql": "^0.10.0",
    "@mastra/pg": "^0.10.0",
    "@mastra/rag": "^0.10.0",
    "@mastra/mcp": "^0.10.0",

    "@modelcontextprotocol/sdk": "^1.0.0",

    "ioredis": "^5.4.0",
    "bullmq": "^5.20.0",
    "inngest": "^3.27.0",

    "imapflow": "^1.0.170",
    "mailparser": "^3.7.0",
    "nodemailer": "^6.9.0",

    "@aws-sdk/client-s3": "^3.670.0",
    "minio": "^8.0.0",

    "unpdf": "^0.12.0",
    "mammoth": "^1.8.0",
    "@unified/processor": "^1.0.0",
    "remark": "^15.0.0",
    "rehype": "^13.0.0",
    "crawlee": "^3.11.0",
    "playwright": "^1.48.0",
    "cheerio": "^1.0.0",

    "@xenova/transformers": "^2.17.0",

    "meilisearch": "^0.45.0",
    "@elastic/elasticsearch": "^8.15.0",

    "zod": "^3.23.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.2.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-node": "^0.54.0",
    "prom-client": "^15.1.0",

    "jose": "^5.9.0",
    "argon2": "^0.41.0",
    "speakeasy": "^2.0.0",
    "passport": "^0.7.0",
    "@node-saml/node-saml": "^5.0.0",
    "casbin": "^5.32.0",

    "ulid": "^2.3.0",
    "nanoid": "^5.0.0",
    "date-fns": "^4.1.0",
    "ky": "^1.7.0",
    "p-limit": "^6.1.0",
    "p-queue": "^8.0.0",
    "sanitize-html": "^2.13.0",
    "marked": "^14.1.0",
    "sharp": "^0.33.0",
    "c12": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/sanitize-html": "^2.13.0",
    "drizzle-kit": "^0.28.0",
    "vitest": "^2.1.0",
    "@biomejs/biome": "^1.9.0",
    "tsx": "^4.19.0",
    "@types/bun": "^1.2.0"
  }
}
```

### 3.2 关键选型理由

#### 3.2.1 运行时：Bun 1.2+ vs Node 22 LTS

| 维度 | Bun 1.2+ | Node 22 LTS |
|------|---------|-------------|
| 启动速度 | **<100ms** | ~500ms |
| 内置功能 | bundler、test、SQLite、密码 hash、shell、watch | 仅 runtime |
| 单二进制部署 | **`bun build --compile`** ~70MB | 需打 Docker |
| 性能 (Hono) | **180k RPS** | 80k RPS |
| 兼容性 | ~99% Node 兼容；某些原生模块需 better-sqlite3 替代 bun:sqlite | 100% |
| WebSocket | Bun.serve 原生 | 需 `ws`/`uWebSockets.js` |

**结论**：默认 **Bun**；构建产物同时支持 Node 22 LTS（兜底，避免单一 runtime 风险）。

#### 3.2.2 HTTP 框架：Hono vs Elysia vs NestJS

| 框架 | 性能 | Runtime 适配 | 生态 | 适合 KeenAI? |
|------|:----:|:------------:|:----:|:------------:|
| **Hono** | 9/10 | ✅ Bun/Node/Workers/Deno/D1 | 8/10 | ✅ 跨 runtime 第一选择 |
| Elysia | 10/10 | Bun-only | 6/10 | Bun 绑定深，舍弃 Edge 灵活性 |
| NestJS | 6/10 | Node | 10/10 | 重型框架，Solo 开发太重 |
| Fastify | 8/10 | Node | 9/10 | 性能好但不跨 runtime |

**结论**：**Hono**——跨 runtime + Streaming + Zod 完美集成 + Vercel AI SDK 官方示例语言。

#### 3.2.3 ORM：Drizzle vs Prisma vs Kysely

| 维度 | Drizzle | Prisma | Kysely |
|------|---------|--------|--------|
| PG + SQLite 同源 | ✅ | ✅ | ✅ |
| 向量类型（pgvector） | ✅ 原生 `vector()` | ❌ raw SQL | ❌ raw SQL |
| Edge / Workers 适配 | ✅ | ⚠️ 需 Driver Adapter | ✅ |
| 包体积 | 7.4KB gzip | 几 MB（rust 引擎） | 小 |
| Type 推断 | ✅ 强 | ✅ 强 | ✅ 强 |
| 类型生成方式 | **schema 即类型**（无 codegen） | codegen | schema 注解 |
| 关系查询 | RQB API | 一流 | 需手写 join |
| 迁移工具 | drizzle-kit | prisma migrate | 手写 |
| 学习曲线 | 中 | 低 | 高 |

**结论**：**Drizzle**——`vector({ dimensions: N })` 原生支持 pgvector、跨方言、无 codegen、Edge 友好。

#### 3.2.4 LLM 编排：Mastra vs LangChain.js vs 手写

| 维度 | Mastra | LangChain.js | 手写 + Vercel AI SDK |
|------|--------|--------------|---------------------|
| 心智模型 | Opinionated，开箱即用 | 抽象层多 | 自由度最高 |
| Agent + Memory + Workflow + Eval | **一体化** | 分散包 | 自建 |
| RAG 模块 | `@mastra/rag`（开箱） | ✅ | 自建 |
| MCP 集成 | `@mastra/mcp` 原生 | 半官方 | 手接 SDK |
| 评估（Eval） | 内置 Scorers | 外置 LangSmith | 自建 |
| Observability | 内置 OTel | 外置 LangSmith | 自建 |
| 文档质量 | 高（含 LLM-friendly llms.txt） | 中 | n/a |
| Solo 开发友好度 | **高**（脚手架 `create-mastra`） | 中 | 低 |
| 与 Vercel AI SDK 关系 | **基于 AI SDK 构建** | 独立体系 | 直接用 |

**结论**：**Mastra**（核心 Agent / Memory / Workflow / RAG）+ **Vercel AI SDK**（底层 LLM 调用、流式、UI 集成）。两者是叠加关系而非互斥。

#### 3.2.5 LLM SDK：Vercel AI SDK v4

```ts
import { generateText, streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 国内模型 / OpenRouter / 本地：用 openai-compatible 一行接入
const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const result = await streamText({
  model: anthropic('claude-sonnet-4-7'),
  messages,
  tools: { weather: tool({...}) },
  experimental_telemetry: { isEnabled: true }, // OTel 自动埋点
});
```

#### 3.2.6 Workflow / Queue：Inngest vs Trigger.dev vs BullMQ vs Temporal-TS

| 维度 | Inngest | Trigger.dev | BullMQ | Temporal TS |
|------|---------|-------------|--------|-------------|
| 模型 | 事件驱动 Saga | 任务编排 | Redis Queue | 工作流引擎 |
| 自托管 | ✅ 开源 | ✅ v3 开源 | ✅ Redis | ✅ |
| Serverless 友好 | ✅✅ | ✅ | ❌ 需常驻 worker | ❌ |
| Step Function（重试、暂停、Wait） | ✅ | ✅ | 弱 | ✅✅ |
| 复杂度 | 低 | 中 | 低 | **高** |
| 适合 Solo | ✅ | ✅ | ✅ | ❌ |
| Indie 场景默认 | **✅ 推荐** | ✅ | 兜底 Redis 队列 | 仅企业级 |

**结论**：**Inngest**（默认）+ **BullMQ**（重 Redis 队列：邮件发送、嵌入批处理）。

#### 3.2.7 数据库后端：PostgreSQL ⟷ SQLite/LibSQL 双轨

KeenAI 采用 **存储抽象接口 + 双后端实现** 架构（详见 [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)）。SQLite 路线**优先选 LibSQL**（Turso 出品的 SQLite fork，向量原生、HTTP API、embedded replicas、与 Mastra 原生集成），`better-sqlite3 + sqlite-vec` 作为完全离线场景兜底。

| 维度 | PostgreSQL 16+ | LibSQL（推荐） | SQLite + sqlite-vec（兜底） |
|------|----------------|----------------|-----------------------------|
| 推荐场景 | SaaS 云版、中大型团队 | Indie / Edge / Lite / Turso 云 | 完全离线、单文件分发 |
| Driver | `postgres-js` | `@libsql/client` | `better-sqlite3` |
| ORM | `drizzle-orm/postgres-js` | `drizzle-orm/libsql` | `drizzle-orm/better-sqlite3` |
| 向量 | `pgvector` (HNSW/IVFFlat) | **`libsql_vector`** 内置 | `sqlite-vec`（vec0 虚拟表） |
| 全文 | `tsvector + GIN`（或 Meili 外置） | **`FTS5`**（嵌入） | `FTS5` |
| 中文分词 | `zhparser` 扩展 | 应用层 jieba 预分词 | 同左 |
| 多租户 | `WHERE org_id =` + 分区表 | `WHERE org_id =` | `vec0 partition key` |
| HA | Patroni / pg_dump | **embedded replicas**（原生多副本） / Turso Cloud | Litestream → S3 |
| 远程 + 本地 | 远程 | **支持本地 + 边缘同步** | 本地 |
| 部署体积 | PG 镜像 ~400MB | Bun 二进制 + .db（~80MB） | 同左 |
| 上限建议 | 千万级向量 / 100M+ 行 | 百万级向量 / 50K 客户 / 单机 | 同左 |
| 升级路径 | — | `bunx keenai migrate-backend --to postgres` | 同左 |

> Bun runtime 也内置 `bun:sqlite`（API 与 better-sqlite3 几乎一致），可在纯 Bun 部署中替代 `better-sqlite3`，从而**零原生编译**。

#### 3.2.8 本地推理：`@xenova/transformers`

```ts
import { pipeline } from '@xenova/transformers';

const embedder = await pipeline(
  'feature-extraction',
  'Xenova/bge-m3' // 100+ 语言 · 1024 dim
);
const output = await embedder(text, { pooling: 'mean', normalize: true });
```

- **优势**：Node + Bun + 浏览器统一 API，无需 Python 微服务
- **支持**：BGE-M3、BGE-Reranker、Jina、e5、MiniLM
- **进阶**：可选 ONNX Runtime GPU（CUDA / WebGPU）

---

## 四、前端依赖清单

### 4.1 Dashboard（`apps/dashboard/package.json`）

```json
{
  "name": "@keenai/dashboard",
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.0",

    "tailwindcss": "^4.0.0",
    "@tailwindcss/typography": "^0.5.15",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",

    "@radix-ui/react-*": "latest",
    "lucide-react": "^0.460.0",
    "@tabler/icons-react": "^3.20.0",

    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.59.0",
    "@tanstack/react-table": "^8.20.0",
    "@tanstack/react-virtual": "^3.10.0",

    "react-hook-form": "^7.53.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.23.0",

    "@tiptap/react": "^3.0.0",
    "@tiptap/starter-kit": "^3.0.0",
    "@tiptap/extension-mention": "^3.0.0",
    "@tiptap/extension-image": "^3.0.0",

    "ai": "^4.0.0",
    "@ai-sdk/react": "^1.0.0",

    "cmdk": "^1.0.0",
    "sonner": "^1.5.0",
    "motion": "^11.10.0",
    "date-fns": "^4.1.0",
    "echarts": "^5.5.0",
    "echarts-for-react": "^3.0.2",

    "@xyflow/react": "^12.3.0",
    "react-resizable-panels": "^2.1.0",

    "next-intl": "^3.20.0",
    "next-themes": "^0.4.0",

    "ky": "^1.7.0",
    "swr": "^2.2.0",
    "partysocket": "^1.0.2"
  }
}
```

### 4.2 Widget（`apps/widget/package.json`，Preact + Vite）

```json
{
  "name": "@keenai/widget",
  "dependencies": {
    "preact": "^10.24.0",
    "@preact/signals": "^1.3.0",
    "preact-router": "^4.1.0",
    "marked": "^14.1.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@preact/preset-vite": "^2.9.0",
    "typescript": "^5.6.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

> 输出单文件 `widget.js`（< 5KB gzip），通过 `<script>` 直接嵌入第三方网站。

---

## 五、基础设施

### 5.1 Docker Compose（三种 profile）

> - `profile: lite`（默认）—— **单容器 Bun + LibSQL**，零外部依赖，适合 Indie / Demo
> - `profile: standard` —— PG + Redis + Meili + MinIO（中型团队 / SaaS）
> - `profile: full` —— Standard + Inngest 自托管 + Ollama + 完整可观测性

```yaml
# docker-compose.yml
version: '3.9'

x-keenai-image: &keenai-image
  image: ghcr.io/ai77/keenai:latest

# ============== Lite Profile（推荐 Indie / 自托管单机）==============
services:
  keenai-lite:
    <<: *keenai-image
    profiles: ["lite"]
    environment:
      RUNTIME: bun
      STORAGE_DRIVER: libsql              # 或 better-sqlite3
      STORAGE_DSN: file:/data/keenai.db
      VECTOR_DRIVER: libsql               # libsql_vector 内置
      FTS_DRIVER: sqlite-fts5
      OBJECT_STORE_DRIVER: local
      OBJECT_STORE_PATH: /data/files
      EMBED_PROVIDER: xenova              # 本地 @xenova/transformers
      EMBED_MODEL: Xenova/bge-m3
      LLM_PROVIDER: ollama                # 或 openai / anthropic
      OLLAMA_BASE_URL: http://ollama:11434
    volumes:
      - keenai_data:/data
    ports: ["3000:3000", "8080:8080"]

  litestream:
    profiles: ["lite"]
    image: litestream/litestream:latest
    command: replicate
    environment:
      LITESTREAM_S3_ACCESS_KEY_ID: ${S3_KEY:-}
      LITESTREAM_S3_SECRET_ACCESS_KEY: ${S3_SECRET:-}
    volumes:
      - keenai_data:/data
      - ./litestream.yml:/etc/litestream.yml:ro
    depends_on: [keenai-lite]

# ============== Standard Profile ==============
  postgres:
    profiles: ["standard", "full"]
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: keenai
      POSTGRES_USER: keenai
      POSTGRES_PASSWORD: dev
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports: ["5432:5432"]

  redis:
    profiles: ["standard", "full"]
    image: redis:7-alpine
    ports: ["6379:6379"]

  meilisearch:
    profiles: ["standard", "full"]
    image: getmeili/meilisearch:v1.10
    environment:
      MEILI_MASTER_KEY: dev_master_key
    volumes:
      - meili_data:/meili_data
    ports: ["7700:7700"]

  minio:
    profiles: ["standard", "full"]
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports: ["9000:9000", "9001:9001"]

  mailcatcher:
    profiles: ["standard", "full"]
    image: schickling/mailcatcher
    ports: ["1080:1080", "1025:1025"]

# ============== Full Profile（Inngest + Ollama + OTel）==============
  inngest:
    profiles: ["full"]
    image: inngest/inngest:latest
    command: inngest dev -u http://api:8080/api/inngest
    ports: ["8288:8288"]

  ollama:
    profiles: ["full"]
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    ports: ["11434:11434"]

  otel-collector:
    profiles: ["full"]
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-config.yaml"]
    volumes:
      - ./otel-config.yaml:/etc/otel-config.yaml:ro

  grafana:
    profiles: ["full"]
    image: grafana/grafana:latest
    ports: ["3030:3000"]

  prometheus:
    profiles: ["full"]
    image: prom/prometheus:latest
    ports: ["9090:9090"]

  loki:
    profiles: ["full"]
    image: grafana/loki:latest
    ports: ["3100:3100"]

# ============== KeenAI Apps（Standard / Full 共享）==============
  api:
    <<: *keenai-image
    profiles: ["standard", "full"]
    depends_on: [postgres, redis, meilisearch, minio]
    environment:
      RUNTIME: bun
      STORAGE_DRIVER: postgres
      STORAGE_DSN: postgres://keenai:dev@postgres:5432/keenai
      VECTOR_DRIVER: pgvector
      FTS_DRIVER: meilisearch              # 或 pg-tsvector
      MEILISEARCH_URL: http://meilisearch:7700
      MEILISEARCH_KEY: dev_master_key
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      INNGEST_BASE_URL: http://inngest:8288   # full profile
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
    command: ["bun", "run", "apps/api/src/index.ts"]
    ports: ["8080:8080"]

  # worker: reserved — background jobs run in API process + Inngest (`packages/kb`, `packages/workflow`)
  # worker:
  #   <<: *keenai-image
  #   profiles: ["standard", "full"]
  #   depends_on: [api, redis]
  #   command: ["bun", "run", "apps/worker/src/index.ts"]

  dashboard:
    profiles: ["standard", "full"]
    build: ./apps/dashboard
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    ports: ["3000:3000"]

  portal:
    profiles: ["standard", "full"]
    build: ./apps/portal
    ports: ["3001:3000"]

volumes:
  keenai_data:
  pg_data:
  meili_data:
  minio_data:
  ollama_data:
```

### 5.2 Helm Chart（生产 K8s）

提供的 Helm Chart 包括：
- API Deployment + HPA（基于 RPS / CPU）
- Worker Deployment + HPA（基于队列深度）
- Dashboard / Portal / Help / Changelog Deployment
- WebSocket Deployment（Sticky Session via Headless Svc + Redis Pub/Sub 跨节点广播）
- Ingress + cert-manager
- ServiceMonitor（Prometheus）
- PostgreSQL Operator（Zalando / CloudNativePG）
- Inngest 自托管
- PVC for stateful services

### 5.3 Edge 部署（Cloudflare Workers）

适用于 Widget API、Embed Loader、Help Center 子集：

```ts
// apps/edge-widget/src/index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@keenai/db/schema';

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const app = new Hono<{ Bindings: Env }>();
    const db = drizzle(env.DB, { schema });
    app.post('/widget/identify', /* HMAC + 写入 D1 */);
    app.post('/widget/messages', /* 转发至 Origin API */);
    return app.fetch(req, env, ctx);
  },
};
```

> Drizzle 原生支持 Cloudflare D1，无须改写业务代码。

---

## 六、CI/CD

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx biome ci .
      - run: bunx tsc -b --noEmit

  test-postgres:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run db:migrate
      - run: STORAGE_DRIVER=postgres bun test
      - run: bun run test:e2e

  test-sqlite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: STORAGE_DRIVER=libsql bun test
      # 双后端契约测试，确保业务代码两路皆通

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx playwright install --with-deps chromium
      - run: bun run e2e

  docker-build:
    needs: [lint, test-postgres, test-sqlite]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/ai77/keenai:latest
```

---

## 七、开发工具链

| 类别 | 工具 |
|------|------|
| 包管理 | **pnpm**（workspaces）+ **Turborepo** |
| 运行时 | **Bun 1.2+**（开发 + 生产默认）· Node 22 LTS（兜底） |
| Lint + Format | **[Biome](https://biomejs.dev/)**（替代 ESLint + Prettier，单工具，Rust 实现） |
| 类型检查 | `tsc -b --noEmit`（增量构建） |
| Pre-commit | **[lefthook](https://lefthook.dev/)** 或 [husky](https://typicode.github.io/husky/) + lint-staged |
| Commit 规范 | commitlint + commitizen + conventional-commits |
| 测试 | **Vitest**（unit / integration）+ **Playwright**（E2E）+ **Storybook** |
| 数据库迁移 | **drizzle-kit** generate / migrate / studio |
| 数据库 GUI | DBeaver / TablePlus / `drizzle-kit studio` |
| API 文档 | **[Hono OpenAPI](https://hono.dev/examples/zod-openapi)** + `@hono/zod-openapi` + Scalar |
| MCP Inspector | `@modelcontextprotocol/inspector` |
| API 测试 | Bruno / Hoppscotch / `bun test:api` |
| Profile | `bun --inspect` + Chrome DevTools / Clinic.js |

---

## 八、安全工具

| 工具 | 用途 |
|------|------|
| `bun audit` / `pnpm audit` | 依赖漏洞扫描 |
| **Snyk** / **Socket.dev** | 综合漏洞与供应链 |
| **Trivy** | Docker 镜像扫描 |
| **Semgrep** | SAST 静态扫描（含 TS 规则） |
| OWASP ZAP | 渗透测试 |
| **dependabot** + Renovate | 自动依赖升级 |
| `helmet` / Hono `secure-headers` | HTTP 安全头 |
| **`zod` schema validation** | 边界输入校验（必须） |
| **`isolated-vm`** / Workers | Custom Action 沙箱执行 |

---

## 九、文档工具

| 用途 | 工具 |
|------|------|
| 文档站点 | **[Fumadocs](https://fumadocs.vercel.app/)**（Next.js 原生） / Mintlify / Nextra |
| API 文档 | OpenAPI（Hono 生成）+ **[Scalar](https://github.com/scalar/scalar)** UI |
| 架构图 | Mermaid（GitHub 原生）+ Excalidraw |
| 设计稿 | Figma |
| LLM 友好文档 | 自动导出 `llms.txt` + `llms-full.txt`（参考 Mastra） |

---

## 十、为什么是 TypeScript 全栈

| 维度 | 收益 |
|------|------|
| **端到端类型安全** | Drizzle Schema → Zod → Hono → React，**改一处全链报错** |
| **跨前后端共享** | `packages/shared` 共享类型、Zod schema、常量、工具 |
| **AI 生态贴合度** | Vercel AI SDK / Mastra / @mcp/sdk / @xenova/transformers 全是 TS 一等公民 |
| **单语言团队** | Solo / 小团队无需双栈切换 |
| **现代部署** | Bun 单二进制、Vercel、Cloudflare Workers，几分钟上线 |
| **开发体验** | Biome（飞快）+ Bun（启动 100ms）+ Drizzle Studio + TanStack 全家桶 |
| **Edge / Serverless** | 同一份代码在 Node / Bun / Workers / Deno 都能跑 |

> 取舍：在极高并发 WebSocket（10w+ 长连接）与重 CPU 任务（PDF 批量解析）场景，TS 比 Go 弱；解决路径是 **水平拆服务** + **本地推理用 `@xenova/transformers` 跑 WASM/ONNX** + **重 CPU 通过 Bun Worker 或独立小型 Python 微服务**。这些场景对 Indie/AI-first SaaS 都不是 day-1 瓶颈。
