# KeenAI

> **Open-source alternative to [Featurebase](https://www.featurebase.app/)** — AI-powered customer support, feedback management, help center, and changelog — all in one self-hostable platform.

[![License](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-fbf0df.svg)](https://bun.sh/)
[![Status](https://img.shields.io/badge/status-alpha-green.svg)](docs/ALPHA.md)

---

## 一、产品愿景

KeenAI 致力于打造一款 **开源、可自托管、AI 原生** 的客户支持与产品反馈一体化平台，为中小团队提供 Featurebase / Intercom / Zendesk / Canny 的开源平替。

**核心价值**：
- **AI 优先**：从 Day 1 就内嵌 AI Agent（Keeni AI），自动解决 60%+ 工单
- **一体化**：支持 + 反馈 + Help Center + Changelog 四合一，无需多套订阅
- **可自托管**：完全开源，数据自主可控，Bun 单二进制 + SQLite 一键启动
- **可扩展**：插件化架构，支持自定义 Channel、Action、MCP Server、AI Model
- **现代化体验**：Notion 式编辑器、命令面板、键盘优先
- **TypeScript 全栈**：单一语言、端到端类型安全、AI SDK 生态原生贴合

---

## 二、产品矩阵

| 模块 | 对应 Featurebase | 状态 |
|------|------------------|------|
| **Inbox** 统一收件箱 | Support Inbox | ✅ Alpha |
| **Channels** 全渠道接入 | Messenger + Email | ✅ Alpha（Widget + Email） |
| **Conversations** 对话生命周期 | Conversations | ✅ Alpha |
| **Tickets** 结构化工单 | Customer/Back-office/Tracker | 🚧 规划中 |
| **Workflows** 无代码自动化 | Workflows | ✅ Alpha（MVP） |
| **Keeni AI Agent** 客服 AI | Fibi AI Agent | 🚧 规划中 |
| **Copilot** 客服辅助 AI | Copilot | ✅ Alpha |
| **Feedback Portal** 反馈中心 | Feedback Portal | 🚧 规划中 |
| **Roadmap** 公开路线图 | Roadmap | 🚧 规划中 |
| **Changelog** 更新日志 | Changelog | 🚧 规划中 |
| **Help Center** 帮助中心 | Help Center | 🚧 规划中 |
| **Surveys** 调研问卷 | Surveys | 🔮 后期 |

---

## 三、技术栈速览（TypeScript 全栈）

| 层 | 选型 |
|----|------|
| 语言 / 运行时 | **TypeScript 5.6+** · **Bun 1.2+**（默认）· Node 22 LTS（兜底） |
| HTTP / 后端框架 | **[Hono](https://hono.dev/)**（跨 runtime、性能领先）· Bun.serve |
| ORM / Migration | **[Drizzle ORM](https://orm.drizzle.team/)**（PG / SQLite / D1 同源） · `drizzle-kit` |
| 数据库（双后端） | **PostgreSQL 16**（含 `pgvector`） **或 SQLite 3.45**（含 `sqlite-vec`） · Redis 7（可选） · Meilisearch（可选） |
| LLM SDK | **[Vercel AI SDK v4](https://sdk.vercel.ai/)** — 一行代码切换 OpenAI/Anthropic/Gemini/DeepSeek/Ollama 等 |
| Agent 编排 | **[Mastra](https://mastra.ai/)**（Agent + Memory + Workflow + Eval + MCP 一体化） |
| MCP（双向） | **`@modelcontextprotocol/sdk`**（官方 TS SDK） |
| 工作流 / 队列 | **[Inngest](https://www.inngest.com/)**（事件驱动 · serverless 风格） + **BullMQ**（重 Redis 队列） |
| 验证 / Schema | **[Zod](https://zod.dev/)**（跨前后端共享 schema） |
| 前端 Dashboard / Portal | **Next.js 15** · React 19 · Shadcn/ui · Tailwind v4 |
| Messenger Widget | **Preact** + Vite（< 5KB） |
| 实时通信 | WebSocket（Bun.serve native）· Redis Pub/Sub |
| 邮件 | SMTP（nodemailer）· IMAP（[imapflow](https://imapflow.com/)）· 解析（mailparser） |
| 爬虫 / 文档 | [crawlee](https://crawlee.dev/) · `unpdf` · `mammoth`（docx） |
| 本地推理 | **[`@xenova/transformers`](https://github.com/xenova/transformers.js)**（embedding / rerank · ONNX · 无需 Python） |
| 存储 | S3 兼容（`@aws-sdk/client-s3` / `minio` / 本地 fs） |
| Monorepo | **Turborepo** + **pnpm workspaces** |
| Lint + Format | **[Biome](https://biomejs.dev/)**（单工具 · Rust · 飞快） |
| 测试 | **Vitest** · Playwright |
| Log | pino |
| 可观测性 | OpenTelemetry · Prometheus · Grafana · Loki |
| 部署 | **`bun build --compile`** → 单二进制 · Docker · **Vercel** · **Cloudflare Workers** |

> 详见 [docs/06-TECH-STACK.md](docs/06-TECH-STACK.md) 与 [docs/12-STORAGE-ABSTRACTION.md](docs/12-STORAGE-ABSTRACTION.md)。

---

## 四、规划文档

### 4.0 本地参考仓库（AI 内核对照源码）

实现 Keeni Agent / Memory 时，可在仓库根目录克隆 **只读对照**（已 `.gitignore`，不提交）：

| 本地目录 | 上游 | 对应文档 |
|----------|------|----------|
| `hermes-agent/` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | [09-AGENT-ENGINE.md](docs/09-AGENT-ENGINE.md) |
| `agentmemory/` | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | [10-AGENT-MEMORY.md](docs/10-AGENT-MEMORY.md)、[11-RAG-KNOWLEDGE.md](docs/11-RAG-KNOWLEDGE.md) |

```bash
git clone --depth 1 https://github.com/NousResearch/hermes-agent.git hermes-agent
git clone --depth 1 https://github.com/rohitg00/agentmemory.git agentmemory
```

入口文件、分工、与 Featurebase 前端的边界说明见 **[docs/00-REFERENCE-REPOS.md](docs/00-REFERENCE-REPOS.md)**。

### 4.1 产品与系统规划

| 文档 | 内容 |
|------|------|
| [00-REFERENCE-REPOS.md](docs/00-REFERENCE-REPOS.md) | **本地参考仓库**：`hermes-agent` / `agentmemory` 克隆方式、读码入口、与 09–11 映射 |
| [01-PRD.md](docs/01-PRD.md) | 产品需求文档（用户、场景、目标） |
| [02-FEATURES.md](docs/02-FEATURES.md) | 功能清单与 Featurebase 对标矩阵 |
| [03-ARCHITECTURE.md](docs/03-ARCHITECTURE.md) | 系统架构设计 |
| [04-MODULES.md](docs/04-MODULES.md) | 核心模块详细设计 |
| [05-FRONTEND.md](docs/05-FRONTEND.md) | 前端 UI 与 Messenger Widget |
| [06-TECH-STACK.md](docs/06-TECH-STACK.md) | 技术栈选型说明（TS-First） |
| [07-DATA-MODEL.md](docs/07-DATA-MODEL.md) | 数据库 Schema 设计 |
| [08-ROADMAP.md](docs/08-ROADMAP.md) | 分阶段执行 Roadmap |

### 4.2 AI 内核设计（Agent / Memory / RAG）

| 文档 | 内容 | 设计参考 |
|------|------|----------|
| [09-AGENT-ENGINE.md](docs/09-AGENT-ENGINE.md) | **Keeni Agent 执行核心**：Plan-Act-Observe-Reflect 主循环、Personality、Context Assembler（轨迹压缩）、Multi-LLM Provider、Tool/MCP、Skill 自学习、Subagent 并行、Sandbox、Cron | [hermes-agent](https://github.com/NousResearch/hermes-agent) + [Mastra](https://mastra.ai/) |
| [10-AGENT-MEMORY.md](docs/10-AGENT-MEMORY.md) | **Keeni Memory 记忆系统**：4 层巩固（Working/Episodic/Semantic/Procedural）、Hook Pipeline、Memory Slots、三流检索（BM25+Vector+Graph + RRF）、Ebbinghaus 衰减、矛盾检测、KG、Team Memory、GDPR | [agentmemory](https://github.com/rohitg00/agentmemory) |
| [11-RAG-KNOWLEDGE.md](docs/11-RAG-KNOWLEDGE.md) | **KB / RAG 知识库**：多源连接器、智能切片、Anthropic Contextual Retrieval、Hybrid Retriever、Reranker、知识图谱、多语言、版本化、Eval Harness | AgentMemory + Anthropic + LlamaIndex.ts |

### 4.3 基础设施 & 自动化

| 文档 | 内容 |
|------|------|
| [12-STORAGE-ABSTRACTION.md](docs/12-STORAGE-ABSTRACTION.md) | **存储抽象层**：TS 接口（`Store` / `VectorStore` / `FTSStore`）+ **Drizzle ORM 双方言**（PG `pgvector` ⟷ SQLite `sqlite-vec`）+ Migration + 契约测试 + 一键迁移 |
| [13-WORKFLOW.md](docs/13-WORKFLOW.md) | **Workflow 引擎**：对标 Featurebase Workflows（13 Trigger / 21 Action）+ **Inngest 执行栈**（step 持久化 / Wait 可中断 / Auto-close）+ React Flow Builder + 版本管理 + Shadow Run + Eval Harness |

---

## 五、开发（P0 · Monorepo 根目录）

```bash
cp .env.example .env
pnpm install
pnpm db:migrate   # 应用 LibSQL 迁移
pnpm seed         # 演示账号 owner@keenai.local / keenai-demo-12
pnpm dev          # API :8090 + Dashboard :3000/inbox
pnpm test
pnpm smoke        # API 冒烟：health + login + /me + conversations（需先 dev + seed）
pnpm storybook    # 设计系统 → http://localhost:6006
```

API 冒烟（另开终端，先 `pnpm dev`）：

```bash
pnpm db:migrate && pnpm seed   # 首次
pnpm smoke                     # 或 bash scripts/smoke.sh
```

```
keenai/
├── apps/
│   ├── api/               @keenai/api
│   └── dashboard/         @keenai/dashboard（Inbox）
├── packages/
│   ├── shared/            @keenai/shared
│   ├── storage/           @keenai/storage (+ Drizzle migrations)
│   ├── auth/              @keenai/auth
│   └── ui/                @keenai/ui（设计系统 + Storybook）
├── infra/                 Docker · Compose
└── docs/                  设计文档
```

与 [06-TECH-STACK.md](docs/06-TECH-STACK.md) §二 Monorepo 结构一致。

### Phase 1 · Conversations API（Sprint 1）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/v1/conversations` | Inbox 列表（`?status=&brandId=&cursor=`） |
| `POST` | `/api/v1/conversations` | 创建会话（可选 `initialMessage`） |
| `GET` | `/api/v1/conversations/:id` | 会话详情 |
| `GET` | `/api/v1/conversations/:id/messages` | 消息历史 |
| `POST` | `/api/v1/conversations/:id/messages` | 发送消息（agent / internal note） |
| `GET` | `/api/v1/conversations/:id/stream` | SSE 实时事件 |
| `GET` | `/api/v1/conversations/:id/ws?access_token=` | WebSocket（Bun 运行时） |

---

## 六、快速开始（Alpha）

> 完整 Alpha 说明见 **[docs/ALPHA.md](docs/ALPHA.md)**。

KeenAI 提供 **三种部署模式**，按需选择：

### 6.1 Lite 模式（默认，Docker · 零外部依赖）

> Indie / 自托管单机 / Demo —— API + Dashboard 双容器，LibSQL 单文件数据库。

```bash
git clone https://github.com/ai77/keenai.git
cd keenai
docker compose --profile lite up --build -d
# 或：pnpm docker:lite

# Dashboard: http://localhost:3000  （owner@keenai.local / keenai-demo-12）
# API:       http://localhost:8090
```

本地开发（无 Docker）：

```bash
cp .env.example .env
pnpm install && pnpm db:migrate && pnpm seed
pnpm dev    # API :8090 + Dashboard :3000
pnpm smoke
```

### 6.2 Standard 模式（PostgreSQL + Redis + MinIO）

适合中型团队 / SaaS。

```bash
docker compose --profile standard up -d
```

### 6.3 Cloud 模式（Vercel / Cloudflare + 托管 PG）

```
Edge:   Cloudflare Workers (Widget API)
Web:    Vercel (Dashboard / Portal / Help Center)
API:    Vercel Functions / Fly.io / Railway (Hono + Bun)
Queue:  Inngest Cloud
DB:     Supabase / Neon / Turso
Vector: pgvector / Qdrant Cloud
```

> 业务从 Lite 升级到 Standard：`bunx keenai migrate-backend --from sqlite --to postgres` 一键迁移（含向量索引重建）。

---

## 七、Roadmap 概览

```
Phase 1 (M1-M3)  MVP：Inbox + Messenger + Email + Basic AI Reply
Phase 2 (M4-M6)  Workflows + Tickets + Feedback Portal
Phase 3 (M7-M9)  Keeni AI Agent + Help Center + Roadmap
Phase 4 (M10-M12) Changelog + Copilot + Multi-brand
Phase 5 (M13+)   插件市场 + 企业级（SSO/SAML/Audit Log）
```

详见 [docs/08-ROADMAP.md](docs/08-ROADMAP.md)。

---

## 八、License

[AGPL-3.0](LICENSE) — 与 Plausible、Cal.com、PostHog、Supabase 等开源 SaaS 平替项目一致，确保商用 SaaS 化场景需开源回馈。

---

## 九、贡献

欢迎 Issue、PR、Discussion。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 工具链说明（Bun + Node）

| 用途 | 推荐 | 说明 |
|------|------|------|
| API 运行时 | **Bun 1.2+** | `pnpm dev:api` · WebSocket · `bun test` 集成测试 |
| 包管理 / 构建 | **pnpm 9+** + **Node 22** | Dashboard、UI、Vitest、Biome |
| 数据库迁移 | pnpm | `pnpm db:migrate`（任意 cwd，路径解析到 monorepo 根） |

未安装 Bun 时 API 无法启动；Dashboard 与测试仅依赖 Node。
