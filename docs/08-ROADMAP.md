# KeenAI 执行路线图与开发计划（TypeScript 全栈 · Solo-Ready）

> 本路线图以 **「Solo Developer + AI 协作」** 起步、**「3-5 人小团队」** 加速、**「成熟期 12 人」** 扩张三档并行设计。Solo 模式下采用 TypeScript 全栈大幅压缩交付周期（详见 [06-TECH-STACK.md](06-TECH-STACK.md)）。

## 一、总体时间线

```
M0     M1    M2    M3    M4    M5    M6    M7    M8    M9    M10   M11   M12
│      │     │     │     │     │     │     │     │     │     │     │     │
├─P0─┤ ├──────Phase 1: MVP───────┤
                                  ├──Phase 2: Tickets+Workflow──┤
                                                                ├──Phase 3: AI完整版──┤
                                                                                       ├──Phase 4: 企业级──┤
P0:    地基建设（Monorepo、CI/CD、Drizzle Schema、Hono API skeleton、设计系统）
P1:    Inbox + Messenger + Email + Copilot 草稿（MVP 公开发布）
P2:    Tickets + Workflows Builder + Feedback Portal + Help Center
P3:    Keeni AI Agent（Mastra + Memory + KB 三件套）+ Roadmap + Changelog
P4:    SSO + Audit + Mobile App + Surveys + 云版 SaaS
```

| 阶段 | 时间（团队规模 1→5） | 目标 | 关键交付 |
|------|----------------------|------|---------|
| **P0 Foundation** | M0 (3-4 周) | 工程基建 | Monorepo + Drizzle + Hono + Biome + CI |
| **P1 MVP** | M1-M3 (10-12 周) | 最小可用 | Alpha 公开 |
| **P2 Core** | M4-M6 (10-12 周) | 核心闭环 | Beta 公开 |
| **P3 AI Full** | M7-M9 (10-12 周) | AI 完整能力 | 1.0 GA 发布 |
| **P4 Enterprise** | M10-M12 (12 周) | 企业级 | 商业化云版 |
| **P5 Ecosystem** | M13+ | 插件生态 | 持续迭代 |

> **Solo 节奏说明**：每个 Sprint 范围保持，但 Solo Dev 借助 Cursor / Claude Code / KeenAI 本身作为 dogfood 工具，将单 Sprint 完成度目标定为 **70-80%**（其余作为 P+1 backlog）。3 个月达到 MVP 是合理目标。

---

## 二、Phase 0：工程地基（M0，3-4 周）

### 团队配置

| 模式 | 配置 |
|------|------|
| **Solo（推荐起步）** | 1 人 = 你 + Cursor / Codex / Claude Code · 美化兼职 |
| **小团队加速** | 全栈 2 · 设计 1（兼） · DevOps 1（兼） |

### 交付物
- [x] Monorepo 结构（pnpm workspace + Turborepo）→ 仓库根目录 [`apps/`](../apps/) · [`packages/`](../packages/)
- [ ] 包结构：`apps/{api,worker,dashboard,portal,widget,docs}` + `packages/{shared,storage,auth,llm,agent,memory,kb,channels,conversation,inbox,ticket,workflow,feedback,helpcenter,changelog,notify}`（**进行中**：`api` + `shared` + `storage` + `auth` + `ui`；conversation 逻辑在 `apps/api`）
- [ ] Bun 1.2+ 运行时 + Node 22 fallback 双工具链验证
- [x] Docker Compose 开发环境（`lite` / `standard` / `full` profiles）骨架 → [`docker-compose.yml`](../docker-compose.yml)
- [ ] GitHub Actions CI/CD（PG + LibSQL 双矩阵）
- [x] **Biome** 统一 lint + format
- [x] **Vitest** 测试基础设施
- [x] **Drizzle Kit** LibSQL 迁移流水线（PG 矩阵待 Week 2）→ `@keenai/storage`
- [x] **Hono** API skeleton + `/health` + Zod validator → `@keenai/api`
- [x] **OpenAPI** 初版（`GET /api/v1/openapi.json` 静态文档；`hono/zod-openapi` 全量生成待续）
- [x] **shadcn/ui + Tailwind v4** 设计系统初版 → `@keenai/ui`
- [x] **Storybook** 启动 → `pnpm storybook`
- [ ] 文档站（[Fumadocs](https://fumadocs.vercel.app/) on Next.js 15）
- [x] LICENSE（AGPL-3.0）、CONTRIBUTING（CoC 待补）
- [ ] **`bunx keenai`** CLI 骨架

### Week 详细计划

**Week 1：仓库与工具链**
- [x] 仓库初始化、目录约定（根目录 `apps/` · `packages/`，见 [06-TECH-STACK.md](06-TECH-STACK.md) §二）
- [x] pnpm workspace + Turborepo 配置
- [ ] Bun + Node 双 lockfile 兼容性验证（`bun install` 主，`npm install` fallback）
- [x] Biome 配置（`biome.json`）
- [ ] 提交规范（Conventional Commits + `commitlint`）
- [x] 包：`@keenai/shared`（Zod schemas + types）骨架

**Week 2：基础设施 + DB**
- [x] Docker Compose（PG + pgvector、Redis、MinIO profiles 骨架）
- [x] LibSQL embedded 本地启动（`@libsql/client` file / `:memory:`）
- [ ] GitHub Actions：Biome check → Vitest → 双方言 Drizzle migrate → API smoke test
- [ ] Sentry / OpenTelemetry Node SDK 接入（`@opentelemetry/sdk-node`）
- [ ] pino logging（控制台 + JSON）
- [x] `@keenai/storage` 包：`Store / VectorStore / FTSStore` 接口 + LibSQL 实现骨架 + `organizations…members` schema

**Week 3：设计系统**（`@keenai/ui` · `packages/ui`）
- [x] shadcn/ui 风格二次封装（`packages/ui` · CVA + Radix Dialog + cmdk）
- [x] Tailwind v4 主题 token（Dark First · KeenAI Violet — 对齐 [05-FRONTEND.md](05-FRONTEND.md) §3.2）
- [x] Storybook 8 + 基础组件（Button / Input / Sheet / Command）→ `pnpm storybook`
- [x] 图标 lucide-react（Inter 字体在 Dashboard 集成时加载）

**Week 4：基础数据 + Auth**
- [x] Drizzle schema：`organizations / brands / accounts / members / teams / team_members` + `sessions / magic_links`
- [x] Drizzle Kit LibSQL 迁移（`0000` + `0001`）
- [x] Casbin 策略 + 默认 4 角色（Owner / Admin / Agent / Lite）→ `@keenai/auth`
- [x] JWT（jose）：`POST /api/v1/auth/login` · `refresh` · `logout`
- [x] Magic Link：`POST /api/v1/auth/magic-link` · `magic-link/verify`（SMTP 可选，dev 打日志）
- [x] `GET /api/v1/me` + 中间件（request-id · rate-limit · optional/required auth · pino）
- [x] `pnpm seed` 演示账号（`owner@keenai.local`）
- [ ] OTel SDK 完整导出（当前为 `OTEL_ENABLED` 占位日志）

---

## 三、Phase 1：MVP（M1-M3，10-12 周）

### 目标
**Alpha 公开**：核心客服闭环可用，社区可试用。

### 团队配置

| 模式 | 配置 |
|------|------|
| **Solo** | 1 人 + AI 助手；专注 W5-W16 核心 path |
| **小团队** | 全栈 3 · 设计 1 |

### 功能范围
- ✅ Organization / Team / Member / RBAC
- ✅ Messenger Widget（Home + Messages）
- ✅ Email Channel（imapflow 拉取 + nodemailer 发送）
- ✅ Inbox（列表 + 详情 + 回复）
- ✅ Conversation 基础生命周期
- ✅ AI Copilot 草稿（Vercel AI SDK + 任一 Provider）
- ✅ Basic Workflow（Inngest · 3 个 Trigger + 3 个 Block）
- ✅ Notification（Email + In-app · Bun WebSocket）
- ✅ Cmd+K 命令面板
- ✅ 中英双语 Dashboard（next-intl）
- ✅ Docker Compose 部署 + `bun build --compile` 单二进制
- ✅ REST API + OpenAPI

### Sprint 分解（2 周一个 Sprint = 6 个 Sprint）

#### Sprint 1（W5-W6）：Conversation 基础
- [x] Drizzle schema：`conversations / messages / attachments / reactions / conversation_events` → migration `0002` · `@keenai/shared` Zod
- [x] WebSocket Gateway（Bun `hono/bun` · 进程内 bus；Redis fanout 待多实例）
- [x] Conversations REST：`GET/POST /conversations` · `GET /conversations/:id` · `GET/POST /conversations/:id/messages`
- [x] Hono SSE endpoint `/conversations/:id/stream`
- [x] Inbox 基础页面（Next.js App Router · 左 Views + 中 List + Thread · TanStack Query）→ `apps/dashboard`
- [x] 实时推送 + 乐观更新（SSE `?access_token=` · 发送消息 optimistic UI）
- [x] Vitest contract test（LibSQL；PG 矩阵待 `PG_DSN` + pg schema）

#### Sprint 2（W7-W8）：Messenger Widget
- [x] Widget Vite 项目（Preact · `apps/widget`；Shadow DOM 待续）
- [x] Boot SDK（embed `<script>` · `KeenAI.boot()` + session）
- [x] HMAC 身份验证（`POST /widget/session` · HMAC-SHA256 userHash）
- [x] Messages Module（`MessagesPanel` · 去重 · 发送态 · Shadow DOM）
- [x] WSS 客户端 + 重连指数退避（`/widget/conversations/:id/ws`）
- [x] 移动端响应式（`@media max-width: 480px` 全屏抽屉）
- [x] 体积监控（`pnpm check:widget` · 预算 80KB gzip，长期目标 5KB）

#### Sprint 3（W9-W10）：Email Channel
- [x] `@keenai/channels-email`（parse · threading · outbound · webhooks）
- [x] MIME 解析（mailparser）
- [x] 邮件 Threading 算法（In-Reply-To / References / Subject normalize）
- [x] SMTP 出站 + 基础文本/HTML 模板（React Email 待接）
- [x] Inbound webhook 适配器 + `POST /api/v1/webhooks/email/*` ingest
- [ ] IMAP Worker（imapflow · Inngest cron `*/30 * * * * *`）
- [ ] BullMQ 队列 `email:send`（重试 3 次 + DLQ）
- [ ] DKIM 文档与配置工具

#### Sprint 4（W11-W12）：Inbox 增强
- [x] Conversation Detail（虚拟滚动 · `@tanstack/react-virtual`）
- [x] Assign / Tag / Snooze / Close 动作（Dashboard 操作栏 + PATCH）
- [x] 内部 Note（`isInternal` 消息 + 样式区分）
- [x] Tiptap 编辑器集成（StarterKit · @mention · `/` macro · 富文本发送）
- [x] 文件上传（本地 presign + PUT · S3/MinIO 待接）
- [x] @mention 队友（`/api/v1/members` + Tiptap Mention）
- [x] 通知中心（`notifications` 表 + REST + WSS push）
- [x] FTSStore + LibSQL FTS5（`GET /search/conversations` · PG 待接）

#### Sprint 5（W13-W14）：AI Copilot 草稿
- [x] `@keenai/llm` 包：Provider Registry + stub / OpenAI / DeepSeek / Kimi / **Gemini**
- [ ] Anthropic / Ollama Provider 适配
- [x] `POST /copilot/draft` 端点（streamText → SSE）
- [x] Cmd+K 集成（cmdk）
- [x] Macros 系统（内置 `/refund` 等 + `GET /macros`）
- [x] 采纳率埋点（accept / edit / discard · `copilot_events`）

#### Sprint 6（W15-W16）：Workflow MVP + 发布
- [ ] `@keenai/workflow` 包：Zod DSL + Inngest function 模板
- [ ] Trigger Engine（First Message / Unresponsive · 2 个）
- [ ] Block：`send_message` / `assign` / `close`
- [ ] 基础 Builder UI（React Flow / `@xyflow/react` 单层）
- [ ] Docker Compose `lite` profile 完善（Bun + LibSQL · 真正单容器跑通）
- [ ] `bun build --compile` 单二进制 demo
- [ ] 用户文档（Fumadocs）+ 5 分钟 Quickstart 视频
- [ ] **Alpha 公开发布**：GitHub Release + Product Hunt + Hacker News

### Phase 1 验收
- [ ] 内部客服可全程在 KeenAI 处理客户请求
- [ ] 客户可通过 Widget / Email 联系
- [ ] AI Copilot 采纳率 ≥ 30%
- [ ] `docker compose --profile lite up` 启动 < 30 秒 · DB 可用 < 5 秒
- [ ] `bun create keenai` 全栈本地启动 < 2 分钟
- [ ] GitHub Stars ≥ 500
- [ ] **Solo 模式额外验收**：维护 ≥ 70% 测试覆盖率（Vitest）+ ≥ 95% CI 绿率

---

## 四、Phase 2：核心闭环（M4-M6，10-12 周）

### 目标
**Beta 公开**：完整 Support + 基础 Product Suite

### 团队配置

| 模式 | 配置 |
|------|------|
| **Solo + 第一员工** | 2 人（你 + 全栈） |
| **小团队** | 全栈 3-4 · 设计 1 |

### 功能范围
- ✅ Tickets（Customer / Back-office / Tracker · 完整状态机）
- ✅ Workflow 完整 Builder（所有 Block · Inngest waitForEvent / sleepUntil）
- ✅ SLA 引擎（Inngest 计时器 + 预警）
- ✅ Feedback Portal MVP（含 AI 去重）
- ✅ Help Center MVP（含 SEO）
- ✅ Slack / Discord 渠道（Bolt + discord.js）
- ✅ Multi-brand 支持
- ✅ User Segments
- ✅ 支持分析看板（ECharts）

### Sprint 分解

#### Sprint 7-8（W17-W20）：Tickets 系统
- [ ] Drizzle schema：`ticket_types / ticket_statuses / tickets / ticket_conversations / ticket_links / ticket_events`
- [ ] 3 种类型（Customer / Back-office / Tracker）+ 配置 UI
- [ ] Convert / Send / Link Workflow Actions
- [ ] Ticket Portal `apps/portal/app/tickets`（Next.js 15 + RSC）
- [ ] 自定义字段（Field DSL · Zod-typed）
- [ ] 邮件通知模板（React Email · 多语言）
- [ ] Tracker fan-out（一个 Tracker → N 个 Customer ticket 状态同步）

#### Sprint 9-10（W21-W24）：Workflow 完整版 + SLA
- [ ] 所有 Block 实现（参见 02-FEATURES）
- [ ] `branches` / `apply_rules` / `http_request` / `wait` / `collect_data`
- [ ] Inngest `step.waitForEvent` / `step.sleepUntil` 集成
- [ ] Workflow 版本管理（draft → published）+ Trace 查看
- [ ] SLA 策略 + 超时预警（50/80/100% 触发）
- [ ] Office Hours（多时区 · `date-fns-tz`）
- [ ] Workflow Builder 完整（React Flow 多层 + 配置面板）

#### Sprint 10b（W24-W25）：Multimodal MVP

> 完整设计：[14-MULTIMODAL.md](14-MULTIMODAL.md) · 跟踪 [08-ROADMAP-TODO.md](08-ROADMAP-TODO.md) Iteration 15+

- [ ] `@keenai/shared`：`MessagePart` / `MessageKind` Zod schema（MM-01）
- [ ] `insertMessage` + `attachments` 关联；API/WS 返回 `attachments[]`（MM-02）
- [ ] `GET /api/v1/attachments/:id/content` 鉴权下载（MM-05）
- [ ] Widget 发图 + Inbox/Dashboard inbound 图片 bubble（MM-03）
- [ ] Dashboard Composer 拖拽/粘贴上传（MM-03）
- [ ] Email 附件 ingest（mailparser → attachments）（MM-04）
- [ ] Copilot vision：对话含图时 native multimodal draft（MM-06）
- [ ] Workflow `send_message` 支持 `attachmentIds`（MM-07）
- [ ] `@keenai/channels-core`：`parseAgentResponse` 骨架（Markdown 图 · 为出站预留）

#### Sprint 11-12（W25-W28）：Feedback + Help Center
- [ ] Drizzle schema：`feedback_boards / feedback_posts / feedback_votes / feedback_comments / feedback_subscriptions`
- [ ] Feedback Board + Post + Vote + Comment
- [ ] AI 自动去重（embed via `@xenova/transformers` bge-m3 → VectorStore search）
- [ ] Public Portal（Next.js SSR + ISR）
- [ ] Help Center Collections + Articles + Tags
- [ ] Tiptap 编辑器扩展（步骤列表 / 信息框 / 折叠面板）
- [ ] Public Help Center 页面（Next.js + SEO + sitemap + OG image · `@vercel/og`）
- [ ] AI Search Answers（基础 RAG · 通过 `@keenai/kb` 接口）
- [ ] Slack（`@slack/bolt`）/ Discord（`discord.js`）渠道适配
- [ ] Multi-brand 配置 UI（域名 / 主题 / Locale / Email From）
- [ ] 分析看板（ECharts · Support / Feedback / HC 三大）
- [ ] **Beta 公开发布**

### Phase 2 验收
- [ ] Featurebase 60% 核心功能对齐
- [ ] 至少 3 个外部团队试用
- [ ] GitHub Stars ≥ 2000
- [ ] 文档站访问 ≥ 1000 PV/月
- [ ] Vitest 单元 + e2e 覆盖率 ≥ 65%
- [ ] Playwright e2e 主路径全绿

---

## 五、Phase 3：AI 完整版（M7-M9，10-12 周）

### 目标
**1.0 GA 发布**：完整 AI Agent 三件套 + Product Suite 全功能。

### 团队配置

| 模式 | 配置 |
|------|------|
| **小团队** | 全栈 3-4 · AI 1 · 设计 1 |
| **加速期** | 上述 + DevRel 1 |

### 功能范围
- ✅ Keeni AI Agent（基于 Mastra 完整版 · 见 [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md)）
- ✅ Memory System 4 层巩固（见 [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md)）
- ✅ KB / RAG Hybrid Retrieval（见 [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)）
- ✅ Custom Actions（Function Calling + HMAC + Sandbox）
- ✅ MCP（Host + Server 双向）
- ✅ Roadmap
- ✅ Changelog（完整版）
- ✅ Telegram / 微信 / 钉钉
- ✅ 国产 LLM（DeepSeek / 智谱 / Moonshot / Qwen）
- ✅ 高级 Workflow（HTTP / Schedule Trigger）
- ✅ AI Resolution 计费统计
- ✅ 多语言（10+）

### Sprint 分解

#### Sprint 13-14（W29-W32）：Keeni AI Agent + Memory
- [ ] `@keenai/agent` 包基于 `@mastra/core/agent`
- [ ] `@keenai/memory` 包基于 `@mastra/memory` + 4 层（observations / episodes / facts / patterns / slots / entities / relations / audit）
- [ ] Mastra processors：PiiFilter / TrajectoryCompressor / ConfidenceFilter
- [ ] Workflow "Let Keeni Answer" Block（含 maxSteps + 工具链）
- [ ] Auto-close + CSAT（Inngest 计时器）
- [ ] Resolution 检测（`generateObject` · confirmed / assumed / unresolved）
- [ ] Memory consolidation Inngest cron（hourly / daily）
- [ ] **Memory Tree**（[15-MEMORY-TREE.md](15-MEMORY-TREE.md) MT-01–06）：
  - [ ] `memory_chunks` + canonicalize + fast-score + admitted/dropped
  - [ ] source tree seal → 物化 `memory_episodes`
  - [ ] `memory.digest_daily` brand 日摘要
  - [ ] 检索 scope：`conversation` / `customer` / `brand_daily`
- [ ] Knowledge Graph extractor（实体 + 关系 · `generateObject` schema）
- [ ] Personality & Branding UI（Brand voice / 头像 / 语言）
- [ ] **多模态 Agent 完整版**（[14-MULTIMODAL.md](14-MULTIMODAL.md) MM-10–15）：
  - [ ] Inngest `media.transcribe` / `media.thumbnail` / `media.vision_summary`
  - [ ] Keeni outbound：`parseAgentResponse` + 生图 / TTS Tools
  - [ ] Widget 语音播放 · 视频 bubble
  - [ ] Telegram / Slack IM 原生多模态收发

#### Sprint 15（W33-W34）：KB / RAG 三流融合
- [ ] `@keenai/kb` 包 + Mastra `MDocument` + `@mastra/rag`
- [ ] Source Connectors：Help Center / 已解决对话 / Feedback / Notion / GitHub / Web Crawl（crawlee）
- [ ] 8 阶段 Ingestion Pipeline（Inngest steps）
- [ ] Parsers：unpdf（PDF）/ mammoth（DOCX）/ cheerio + marked（HTML/MD）
- [ ] Chunkers：semantic / hierarchical / contextual（Anthropic Contextual Retrieval · Vercel AI SDK prompt caching）
- [ ] Embed：`@xenova/transformers` bge-m3 本地（ONNX）
- [ ] Hybrid Retriever：BM25（FTSStore）+ Vector（VectorStore）+ Graph + RRF Fusion
- [ ] Reranker：`@xenova/transformers` bge-reranker-v2-m3
- [ ] Diversity / Recency 后置
- [ ] `kb_query_logs` + 用户反馈循环
- [ ] Memory Tree Phase 2（[15-MEMORY-TREE.md](15-MEMORY-TREE.md) MT-07–09）：topic tree + hotness · Memory Explorer UI · [x]
- [ ] Keeni Memory 原生（[08-ROADMAP-TODO.md](08-ROADMAP-TODO.md) KM-01～13）：hybrid RRF · FTS/Vector · facts/slots · consolidation

#### Sprint 16（W35-W36）：Custom Actions + MCP
- [ ] Action 4 步配置 UI（基本信息 / 参数 / 端点 / 数据权限）
- [ ] HMAC 签名（`crypto.subtle.sign`）
- [ ] Vercel AI SDK `tool()` 集成
- [ ] 内置变量（`{{user_id}}` 等）+ Sandbox 三档（http_direct / workers / isolated-vm）
- [ ] Data Access 字段白名单
- [ ] Action 调用日志（OTel span + Drizzle）
- [ ] `@modelcontextprotocol/sdk` Host 模式（外部 MCP server 接入）
- [ ] MCP Server 暴露 KeenAI 工具（其他 LLM Agent 可调用）

#### Sprint 17（W37-W38）：Roadmap + Changelog + 国产化
- [ ] Roadmap Kanban / Timeline 视图（dnd-kit + TanStack Table）
- [ ] Changelog 编辑器（Tiptap + AI 起草 from Linear / Jira 已完成 issue）
- [ ] 受众分群发布（segment DSL · Zod）
- [ ] 应用内 Widget 弹窗 + Email 通知模板
- [ ] Telegram 渠道（grammy）
- [ ] 钉钉 / 飞书 渠道
- [ ] DeepSeek / 智谱 / Moonshot / Qwen 适配（`@ai-sdk/openai-compatible`）
- [ ] AI Prompt 中文优化（指令调优 + 评测集）
- [ ] 10 种语言（next-intl messages + AI 翻译辅助）

#### Sprint 18（W39-W40）：评测 + 发布准备
- [ ] Mastra Eval + DeepEval-TS 评测集（faithfulness / relevance / contextual recall）
- [ ] 黄金问题集 `kb_golden_queries` + CI nightly run
- [ ] 性能优化（autocannon 压测 → 调 Bun 并发 / Drizzle 索引）
- [ ] 文档站完整化（架构 / API / 部署 / 迁移指南）
- [ ] 部署文档（Docker Compose / Helm Chart / Vercel + Cloudflare Workers / Bun 单二进制）
- [ ] 视频教程（YouTube + B 站）
- [ ] 迁移工具（Intercom / Zendesk → KeenAI · `bunx keenai import`）
- [ ] **1.0 GA 发布**

### Phase 3 验收
- [ ] Keeni AI 自动解决率 ≥ 50%（基于 Resolution Detector）
- [ ] 支持 Ollama 完全离线（端到端无外网 demo）
- [ ] Featurebase 90% 核心功能对齐
- [ ] GitHub Stars ≥ 5000
- [ ] 自托管实例数 ≥ 200（telemetry 自愿上报）
- [ ] Mastra Eval faithfulness ≥ 0.85 · contextual recall ≥ 0.75

---

## 六、Phase 4：企业级与云版（M10-M12，12 周）

### 目标
**云版商业化**：企业级特性 + 移动端 + SaaS。

### 团队配置（成熟期启动）

| 角色 | 人数 |
|------|------|
| Tech Lead | 1（你） |
| Full-stack TS | 3-5 |
| Mobile（Expo / RN） | 1-2 |
| DevOps / SRE | 1-2 |
| AI Engineer | 1 |
| Designer | 1 |
| Tech Writer | 1 |
| DevRel | 1 |
| PM | 1 |
| QA | 1 |

### 功能范围
- ✅ SSO（SAML / OIDC · `@node-saml/node-saml`）
- ✅ Audit Log 完整版
- ✅ 数据导出 / 删除（GDPR · 详见 10-AGENT-MEMORY.md § 9）
- ✅ Mobile App（Expo · React Native · iOS + Android）
- ✅ Surveys（CSAT / NPS / 自定义）
- ✅ 高级分析（自定义看板）
- ✅ Zapier / n8n / Make 集成
- ✅ 云版 SaaS（keenai.cloud · Vercel + Cloudflare + Neon + Inngest Cloud）
- ✅ Billing 模块（Stripe）

### Sprint 分解

#### Sprint 19（W41-W42）：企业级安全
- [ ] SAML 2.0（`@node-saml/node-saml`）
- [ ] OIDC（`openid-client`）
- [ ] 2FA / MFA 完整（TOTP + WebAuthn 备份码）
- [ ] Audit Log 全面（敏感操作 + diff）
- [ ] IP 白名单（中间件）
- [ ] Session 管理（Redis · 撤销列表 / 强制下线）
- [ ] Field-level encryption（KMS / age）

#### Sprint 20-21（W43-W46）：Mobile App
- [ ] Expo 项目搭建（共享 `@keenai/shared` types 实现真·端到端类型安全）
- [ ] 核心 Inbox 功能
- [ ] Push Notifications（FCM / APNs · Expo Push）
- [ ] 离线优先（TanStack Query persistence）
- [ ] iOS / Android 上架

#### Sprint 22（W47-W48）：Surveys + Analytics
- [ ] Surveys 系统（DSL · Zod）
- [ ] CSAT 自动触发（关闭对话后 / N 分钟无响应）
- [ ] 自定义看板（拖拽 + React Flow widgets）
- [ ] 报表导出（CSV / Excel · `exceljs` / PDF · `@react-pdf/renderer`）
- [ ] 邮件订阅周报（Inngest cron + React Email）

#### Sprint 23（W49-W50）：集成生态
- [ ] Zapier App（公开版）
- [ ] n8n 模板（社区 + 自研节点）
- [ ] Make.com 模板
- [ ] HubSpot / Salesforce 完整集成
- [ ] OAuth Apps（开发者授权 · Scope 粒度）

#### Sprint 24（W51-W52）：商业化
- [ ] Billing 模块（Stripe + 国内 Pingxx）
- [ ] 用量统计（AI tokens · seats · WAU）
- [ ] keenai.cloud 上线（Vercel + Neon + Inngest Cloud + Upstash Redis）
- [ ] 国内云版（阿里云 / 腾讯云镜像）
- [ ] **企业版商业化发布**

---

## 七、Phase 5：生态扩展（M13+）

### 长期方向
- **插件市场**：基于 MCP Server 协议的第三方扩展生态
- **OAuth Apps**：开发者应用市场（公开 + 私有）
- **Audio / Video**：语音工单、视频通话（LiveKit）
- **Co-browse**：屏幕共享辅助（rrweb）
- **Voice AI**：语音对话 Agent（Whisper + 11labs · Mastra 多模态 Agent）
- **更多 AI**：FAQ 自动生成、对话总结、客户情绪分析（Mastra workflow）
- **Agent Network**：客服多智能体协作（Mastra Agent Networks · 主 + 子 + 评审）
- **生态合作**：与开源项目互操作（Plausible / Cal.com / Supabase / PostHog）

---

## 八、Solo Developer 加速指南

### 8.1 工具链高度自动化
- **Cursor / Claude Code / Codex** 全程结对
- **KeenAI 自身 dogfood**：用 alpha 版处理自己的开源 issue + 收集 GitHub Discussions
- **`bunx keenai` CLI**：一键 scaffold / migrate / seed / 切换后端 / 重建索引

### 8.2 时间分配建议（周）

| 时段 | 任务 |
|------|------|
| 一 / 三 / 五 全天 | 核心 coding（Sprint backlog） |
| 二 / 四 上午 | 文档 + 视频 + 社区回复 |
| 二 / 四 下午 | 设计 + 评测 + 重构 |
| 周末 | 选做：博客 / 推广 / OKR review |

### 8.3 自动化优先级
1. CI 全绿门禁（Biome + Vitest + Playwright + Drizzle migrate）
2. PR 自动 review（KeenAI Bugbot / Claude Code Review GitHub Action）
3. Telemetry 自愿上报 → 优先级反馈
4. 发布自动化（changesets + GitHub Release + Docker Hub + npm）

---

## 九、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Featurebase 加速迭代 | 高 | 中 | 聚焦差异化（自托管、国产、AI 三件套深度） |
| 自托管运维门槛高 | 中 | 高 | `bun build --compile` 单二进制 + Docker Compose 三档 profile + 详细文档 |
| AI 成本失控 | 中 | 高 | Ollama + Token 配额 + 路由策略（廉价模型优先）+ Prompt cache（Anthropic） |
| Inngest 厂商绑定 | 低 | 中 | 抽象 WorkflowEngine 接口；自托管 Inngest dev server / 备 BullMQ 实现 |
| Mastra 早期成熟度 | 中 | 中 | Memory / Agent / RAG 走 Mastra；保留 `@keenai/agent` 适配层，必要时降级直调 ai SDK |
| Bun 边界 case | 中 | 低 | Node 22 双 runtime CI 矩阵，关键路径维持 `bun + node` 双验证 |
| 邮件送达率 | 中 | 高 | 多 Provider（Resend / SendGrid / Mailgun / Postal 自建） |
| 团队招聘（Solo→团队） | 高 | 中 | 开源社区招募 + 全栈 TS 单技能栈门槛低 |
| 知识产权 | 低 | 高 | 完全独立实现，无代码复制 |
| 数据库扩展 | 中 | 高 | Store 接口允许平滑切换 PG / LibSQL → 后期 Sharding by `org_id` |
| pgvector / libsql_vector 性能上限 | 中 | 中 | VectorStore 接口可切换 Qdrant / Pinecone / Weaviate |

---

## 十、关键里程碑

| 里程碑 | 时间 | 标志 |
|--------|------|------|
| 🚀 Repository Open | M0 末 | GitHub 仓库公开 + `bun create keenai` 可用 |
| 🎯 Alpha Release | M3 末 | `docker compose --profile lite up` < 30s 跑通 |
| 🌟 Beta Release | M6 末 | 3 个外部用户试用 |
| 🎉 1.0 GA | M9 末 | Production Ready + Mastra Eval ≥ 阈值 |
| 💼 Cloud Launch | M12 末 | SaaS keenai.cloud 商业化 |
| 🌍 5000 Stars | M9 | 社区里程碑 |
| 🌍 10000 Stars | M15 | 社区里程碑 |

---

## 十一、社区与推广策略

### 11.1 内容营销
- 技术博客（架构剖析、AI 实践、Bun + Hono 实战、Drizzle 双方言迁移）
- 与 Plausible / Cal.com / PostHog / Supabase 同类对比文
- 中文社区：少数派、V2EX、思否、掘金、知乎
- 海外：Product Hunt、Hacker News、Reddit、DEV.to、Indie Hackers

### 11.2 社区运营
- Discord / Slack 中英双频道
- GitHub Discussions
- 月度产品 Office Hour（YouTube + B 站直播）
- 季度 KeenAI Conf（线上）

### 11.3 合作
- 与开源 SaaS 联盟合作（Plausible / Cal.com / Supabase）
- 与 LLM 厂商合作（Ollama / DeepSeek / Anthropic credits）
- 与 framework 厂商合作（Mastra / Vercel / Turso）
- 与云厂商合作（Hetzner / Cloudflare / 阿里云 / 腾讯云）

### 11.4 商业化
- AGPL 强制开源（防止 SaaS 套壳）
- 双 License：AGPL + 商业 License（企业可购买豁免）
- 云托管 SaaS：keenai.cloud（按 seat / WAU + AI tokens 计费）
- 企业版：私有化 + SLA 支持（年费）

---

## 十二、Day 1 任务清单（启动当天）

### 立即可执行
- [ ] 注册 GitHub Org：`github.com/keenai`
- [ ] 注册域名：`getkeen.sh`
- [ ] 注册 Discord 服务器
- [ ] 注册 Twitter / 微博 / B 站账号
- [ ] 初始化 Monorepo（pnpm + Turborepo）+ Bun toolchain
- [ ] 创建 `@keenai/shared` 包 + 第一个 Zod schema
- [ ] 提交本规划文档（README / docs/01-12）到仓库
- [ ] 创建 GitHub Project Board
- [ ] 创建 Roadmap Issue 模板
- [ ] 在 GitHub Topics 标记：`open-source`、`typescript`、`ai-agent`、`customer-support`、`featurebase-alternative`

### 第一周
- [ ] 配置 CI/CD（GitHub Actions + Biome + Vitest + Drizzle migrate）
- [ ] 初始化 Docker Compose `lite` profile（Bun + LibSQL one-container）
- [ ] 完成设计系统初版（shadcn/ui + Tailwind v4）
- [ ] 跑通 `bun create keenai` scaffold
- [ ] 发布 「KeenAI 立项公告」 博客 + 「Why TypeScript Full-Stack」 技术博客
- [ ] 在 Indie Hackers / r/selfhosted / r/SaaS / Hacker News 发帖

---

## 十三、成功标准（一年后）

### 必达
- ✅ Featurebase 80% 功能对齐
- ✅ GitHub Stars ≥ 5000
- ✅ 自托管实例 ≥ 1000
- ✅ 月活贡献者 ≥ 30
- ✅ 文档站月 PV ≥ 5 万
- ✅ Discord 成员 ≥ 1000

### 期望
- 🎯 SaaS 付费客户 ≥ 100
- 🎯 ARR ≥ $100k
- 🎯 媒体报道（36Kr / TechCrunch / The Register / DEV.to weekly）
- 🎯 被收录到 Awesome Self-Hosted List + Awesome AI Agents

---

## 十四、即刻行动

完成本规划后，建议立即开展：

1. **本周内**：决策技术栈最终确认（✅ Done — TypeScript 全栈，详见 06）、品牌命名（KeenAI ✅）、首页 landing 设计稿
2. **下周**：执行 Phase 0 Week 1 任务（Monorepo + Biome + Drizzle skeleton）
3. **2 周内**：第一个 PR 合并（`bun run dev` + `/api/v1/health` 200 OK）
4. **1 个月内**：Phase 0 完成（Auth + Org/Brand + Storage abstraction），启动 Phase 1
5. **3 个月内**：Alpha 公开发布（`docker compose --profile lite up` 全链路跑通）

让我们开始构建 **「下一代开源、AI 原生、TypeScript 全栈的客户支持平台」**。🚀
