# KeenAI

> **Open-source alternative to [Featurebase](https://www.featurebase.app/)** — AI-powered customer support, feedback management, help center, and changelog — all in one self-hostable platform.

[![License](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-fbf0df.svg)](https://bun.sh/)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-alpha-green.svg)](docs/ALPHA.md)

---

## 1. Vision

KeenAI is an **open-source, self-hostable, AI-native** platform that unifies customer support and product feedback — an open alternative to Featurebase, Intercom, Zendesk, and Canny for small and mid-size teams.

**Core values:**

- **AI-first** — Keeni AI Agent built in from day one, targeting 60%+ automated resolution
- **All-in-one** — Support, feedback, Help Center, and Changelog in a single product
- **Self-hostable** — Fully open source, data under your control, one-command launch with Bun + SQLite
- **Extensible** — Plugin architecture for custom Channels, Actions, MCP servers, and AI models
- **Modern UX** — Notion-style editor, command palette, keyboard-first workflows
- **TypeScript end-to-end** — One language, full type safety, native fit with the AI SDK ecosystem

---

## 2. Product Matrix

| Module | Featurebase equivalent | Status |
|--------|------------------------|--------|
| **Inbox** | Support Inbox | ✅ Alpha |
| **Channels** | Messenger + Email | ✅ Alpha (Widget + Email) |
| **Conversations** | Conversations | ✅ Alpha |
| **Tickets** | Customer / Back-office / Tracker | 🚧 Planned |
| **Workflows** | Workflows | ✅ Alpha (MVP) |
| **Keeni AI Agent** | Fibi AI Agent | 🚧 Planned |
| **Copilot** | Copilot | ✅ Alpha |
| **Feedback Portal** | Feedback Portal | 🚧 Planned |
| **Roadmap** | Roadmap | 🚧 Planned |
| **Changelog** | Changelog | 🚧 Planned |
| **Help Center** | Help Center | 🚧 KB `help_center` source + search stub（无独立 Portal UI） |
| **Surveys** | Surveys | 🔮 Later |

---

## 3. Tech Stack (TypeScript Full-Stack)

| Layer | Choice |
|-------|--------|
| Language / Runtime | **TypeScript 5.6+** · **Bun 1.2+** (default) · Node 22 LTS (fallback) |
| HTTP / Backend | **[Hono](https://hono.dev/)** (cross-runtime, high performance) · Bun.serve |
| ORM / Migrations | **[Drizzle ORM](https://orm.drizzle.team/)** (PG / SQLite / D1) · `drizzle-kit` |
| Database (dual backend) | **PostgreSQL 16** (+ `pgvector`) **or SQLite 3.45** (+ `sqlite-vec`) · Redis 7 (optional) · Meilisearch (optional) |
| LLM SDK | **[Vercel AI SDK v4](https://sdk.vercel.ai/)** — swap OpenAI / Anthropic / Gemini / DeepSeek / Ollama in one line |
| Agent orchestration | **[Mastra](https://mastra.ai/)** (Agent + Memory + Workflow + Eval + MCP) |
| MCP (bidirectional) | **`@modelcontextprotocol/sdk`** (official TS SDK) |
| Workflow / Queue | **[Inngest](https://www.inngest.com/)** (event-driven) + **BullMQ** (Redis-heavy queues) |
| Validation / Schema | **[Zod](https://zod.dev/)** (shared across frontend and backend) |
| Dashboard / Portal | **Next.js 15** · React 19 · Shadcn/ui · Tailwind v4 |
| Messenger Widget | **Preact** + Vite (< 5KB) |
| Real-time | WebSocket (Bun.serve native) · Redis Pub/Sub |
| Email | SMTP (nodemailer) · IMAP ([imapflow](https://imapflow.com/)) · parsing (mailparser) |
| Crawling / Documents | [crawlee](https://crawlee.dev/) · `unpdf` · `mammoth` (docx) |
| Local inference | **[`@xenova/transformers`](https://github.com/xenova/transformers.js)** (embedding / rerank · ONNX · no Python) |
| Object storage | S3-compatible (`@aws-sdk/client-s3` / MinIO / local fs) |
| Monorepo | **Turborepo** + **pnpm workspaces** |
| Lint + Format | **[Biome](https://biomejs.dev/)** |
| Testing | **Vitest** · Playwright |
| Logging | pino |
| Observability | OpenTelemetry · Prometheus · Grafana · Loki |
| Deployment | **`bun build --compile`** → single binary · Docker · **Vercel** · **Cloudflare Workers** |

> See [docs/06-TECH-STACK.md](docs/06-TECH-STACK.md) and [docs/12-STORAGE-ABSTRACTION.md](docs/12-STORAGE-ABSTRACTION.md).

---

## 4. Documentation

### 4.0 Local Reference Repos (AI Core)

When implementing Keeni Agent / Memory, clone these **read-only references** at the repo root (gitignored, not committed):

| Local path | Upstream | Related docs |
|------------|----------|--------------|
| `hermes-agent/` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | [09-AGENT-ENGINE.md](docs/09-AGENT-ENGINE.md) |
| `agentmemory/` | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | [10-AGENT-MEMORY.md](docs/10-AGENT-MEMORY.md), [11-RAG-KNOWLEDGE.md](docs/11-RAG-KNOWLEDGE.md) |

```bash
git clone --depth 1 https://github.com/NousResearch/hermes-agent.git hermes-agent
git clone --depth 1 https://github.com/rohitg00/agentmemory.git agentmemory
```

Entry points, responsibilities, and boundaries with the Featurebase-style frontend are in **[docs/00-REFERENCE-REPOS.md](docs/00-REFERENCE-REPOS.md)**.

### 4.1 Product & System Design

| Doc | Contents |
|-----|----------|
| [00-REFERENCE-REPOS.md](docs/00-REFERENCE-REPOS.md) | Local reference repos: clone setup, code entry points, mapping to docs 09–11 |
| [01-PRD.md](docs/01-PRD.md) | Product requirements (users, scenarios, goals) |
| [02-FEATURES.md](docs/02-FEATURES.md) | Feature list and Featurebase comparison matrix |
| [03-ARCHITECTURE.md](docs/03-ARCHITECTURE.md) | System architecture |
| [04-MODULES.md](docs/04-MODULES.md) | Core module design |
| [05-FRONTEND.md](docs/05-FRONTEND.md) | Frontend UI and Messenger Widget |
| [06-TECH-STACK.md](docs/06-TECH-STACK.md) | Tech stack rationale (TS-first) |
| [07-DATA-MODEL.md](docs/07-DATA-MODEL.md) | Database schema design |
| [08-ROADMAP.md](docs/08-ROADMAP.md) | Phased execution roadmap |
| [docs/index.md](docs/index.md) | Documentation hub |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Self-host: Docker lite, Bun binary, cloud-shaped deploy |
| [MIGRATION.md](docs/MIGRATION.md) | Intercom / Zendesk import (`keenai import` stub) |
| [GA.md](docs/GA.md) | Release checklist (v0.2.0 = Phase 0～3 complete) |

### 4.2 AI Core (Agent / Memory / RAG)

| Doc | Contents | References |
|-----|----------|------------|
| [09-AGENT-ENGINE.md](docs/09-AGENT-ENGINE.md) | **Keeni Agent runtime**: Plan-Act-Observe-Reflect loop, personality, context assembly, multi-LLM providers, tools/MCP, skill learning, subagents, sandbox, cron | [hermes-agent](https://github.com/NousResearch/hermes-agent) + [Mastra](https://mastra.ai/) |
| [10-AGENT-MEMORY.md](docs/10-AGENT-MEMORY.md) | **Keeni Memory**: 4-layer consolidation, hook pipeline, memory slots, hybrid retrieval (BM25 + vector + graph), decay, contradiction detection, KG, team memory, GDPR | [agentmemory](https://github.com/rohitg00/agentmemory) |
| [11-RAG-KNOWLEDGE.md](docs/11-RAG-KNOWLEDGE.md) | **KB / RAG**: multi-source connectors, chunking, contextual retrieval, hybrid retriever, reranker, knowledge graph, i18n, versioning, eval harness | AgentMemory + Anthropic + LlamaIndex.ts |

### 4.3 Infrastructure & Automation

| Doc | Contents |
|-----|----------|
| [12-STORAGE-ABSTRACTION.md](docs/12-STORAGE-ABSTRACTION.md) | **Storage abstraction**: `Store` / `VectorStore` / `FTSStore` + Drizzle dual-dialect (PG `pgvector` ⟷ SQLite `sqlite-vec`), migrations, contract tests |
| [13-WORKFLOW.md](docs/13-WORKFLOW.md) | **Workflow engine**: Featurebase-style workflows (13 triggers / 21 actions) + Inngest execution, React Flow builder, versioning, shadow runs, eval harness |
| [14-MULTIMODAL.md](docs/14-MULTIMODAL.md) | **Multimodal messaging**: text / image / audio / video / file — canonical `MessagePart` model, inbound adapters, media pipeline, Agent vision/STT, outbound rendering |
| [15-MEMORY-TREE.md](docs/15-MEMORY-TREE.md) | **Memory Tree**: OpenHuman-style summary trees (source / topic / global), bucket-seal pipeline, hotness, on top of Keeni 4-layer memory |

---

## 5. Development (Monorepo Root)

```bash
cp .env.example .env
pnpm install
pnpm db:migrate   # Apply LibSQL migrations
pnpm seed         # Demo account: owner@keenai.local / keenai-demo-12
pnpm dev          # API :8090 + Dashboard :3000/inbox
pnpm test
pnpm smoke        # API smoke test: health + login + /me + conversations (requires dev + seed)
pnpm kb:eval      # KB golden retrieval eval (Vitest)
pnpm kb:bench     # KB search load test (requires dev + seed; see docs/DEPLOYMENT.md)
pnpm keenai import intercom --file ./export.zip --org-slug demo --dry-run
pnpm storybook    # Design system → http://localhost:6006
```

API smoke test (separate terminal, after `pnpm dev`):

```bash
pnpm db:migrate && pnpm seed   # First run
pnpm smoke                     # or: bash scripts/smoke.sh
```

```
keenai/
├── apps/
│   ├── api/               @keenai/api
│   └── dashboard/         @keenai/dashboard (Inbox)
├── packages/
│   ├── shared/            @keenai/shared
│   ├── storage/           @keenai/storage (+ Drizzle migrations)
│   ├── auth/              @keenai/auth
│   └── ui/                @keenai/ui (design system + Storybook)
├── infra/                 Docker · Compose
└── docs/                  Design docs
```

Matches the monorepo layout in [06-TECH-STACK.md](docs/06-TECH-STACK.md) §2.

### Phase 1 · Conversations API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/conversations` | Inbox list (`?status=&brandId=&cursor=`) |
| `POST` | `/api/v1/conversations` | Create conversation (optional `initialMessage`) |
| `GET` | `/api/v1/conversations/:id` | Conversation detail |
| `GET` | `/api/v1/conversations/:id/messages` | Message history |
| `POST` | `/api/v1/conversations/:id/messages` | Send message (agent / internal note) |
| `GET` | `/api/v1/conversations/:id/stream` | SSE real-time events |
| `GET` | `/api/v1/conversations/:id/ws?access_token=` | WebSocket (Bun runtime) |

---

## 6. Quick Start (Alpha)

> Full Alpha details: **[docs/ALPHA.md](docs/ALPHA.md)**.

KeenAI supports **three deployment profiles**:

### 6.1 Lite (default — Docker, zero external deps)

> Indie / self-hosted single machine / demo — API + Dashboard containers, LibSQL single-file database.

```bash
git clone https://github.com/ai77/keenai.git
cd keenai
docker compose --profile lite up --build -d
# or: pnpm docker:lite

# Dashboard: http://localhost:3000  (owner@keenai.local / keenai-demo-12)
# API:       http://localhost:8090
```

Local development (no Docker):

```bash
cp .env.example .env
pnpm install && pnpm db:migrate && pnpm seed
pnpm dev    # API :8090 + Dashboard :3000
pnpm smoke
```

### 6.2 Standard (PostgreSQL + Redis + MinIO)

For mid-size teams / SaaS deployments.

```bash
docker compose --profile standard up -d
```

### 6.3 Cloud (Vercel / Cloudflare + managed PG)

```
Edge:   Cloudflare Workers (Widget API)
Web:    Vercel (Dashboard / Portal / Help Center)
API:    Vercel Functions / Fly.io / Railway (Hono + Bun)
Queue:  Inngest Cloud
DB:     Supabase / Neon / Turso
Vector: pgvector / Qdrant Cloud
```

> Migrating from Lite to Standard: `bunx keenai migrate-backend --from sqlite --to postgres` (includes vector index rebuild).

---

## 7. Roadmap Overview

```
Phase 1 (M1–M3)   MVP: Inbox + Messenger + Email + Basic AI Reply
Phase 2 (M4–M6)   Workflows + Tickets + Feedback Portal
Phase 3 (M7–M9)   Keeni AI Agent + Help Center + Roadmap
Phase 4 (M10–M12) Changelog + Copilot + Multi-brand
Phase 5 (M13+)    Plugin marketplace + Enterprise (SSO / SAML / Audit Log)
```

See [docs/08-ROADMAP.md](docs/08-ROADMAP.md).

---

## 8. License

[AGPL-3.0](LICENSE) — Same license model as Plausible, Cal.com, PostHog, and Supabase: SaaS deployments must contribute back.

---

## 9. Contributing

Issues, PRs, and Discussions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

### Toolchain (Bun + Node)

| Purpose | Recommended | Notes |
|---------|-------------|-------|
| API runtime | **Bun 1.2+** | `pnpm dev:api` · WebSocket · Bun integration tests |
| Package manager / build | **pnpm 9+** + **Node 22** | Dashboard, UI, Vitest, Biome |
| Database migrations | pnpm | `pnpm db:migrate` (resolves paths to monorepo root from any cwd) |

The API requires Bun; Dashboard and tests run on Node only.
