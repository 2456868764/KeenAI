# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> **迭代闭环**（Phase 4 起）：`实现 → pnpm lint → pnpm typecheck → pnpm test → git commit → git push`  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成 · `[-]` 取消

---

## 下阶段执行列表（单轨顺序 · 指针随迭代推进）

| 序 | 迭代 | 轨道 | 交付 | 状态 |
|----|------|------|------|------|
| 1 | I77 | Phase 8 · MT-06 | Agent scope 路由 stub（`assembleAgentMemoryContext`） | [x] |
| 2 | I78 | KB Phase A · KB-07 | `@xenova/transformers` bge-m3 embedder | [x] |
| 3 | I79 | KB-08 | bge-reranker-v2-m3 reranker | [x] |
| 4 | I80 | KB-09 | KG entity-link expansion（第三检索流） | [x] |
| 5 | I81 | KB-10 | Hierarchical chunk hydrate | [x] |
| 6 | I82 | KB-11 | Diversity + Recency 后置 | [x] |
| 7 | I83 | KB-12 | `kb_query_logs` + feedback API | [x] |
| 8 | I84～I90 | KB Phase B | KB-13～18 + KG-05 | [x] |
| 9 | I91～I96 | KB Phase C | KB-19～24 · Compounding 闭环 | [x] |
| 10 | I97～I98 | Sprint 18 · Eval | golden suite + nightly CI | [x] |
| 11 | I99～I100 | Sprint 18 · 压测 + 部署文档 | kb:bench · DEPLOYMENT.md | [x] |
| 12 | I101～I103 | Sprint 18 · GA prep | import CLI · Mastra judge · docs hub | [x] |
| 13 | I104 | GA · CSAT | `rating` API + widget CSAT · crystallize 无默认 5 分 | [x] |
| 14 | I105 | GA · Import | Zendesk HC JSON → `kb_documents` 实写（`keenai import`） | [x] |
| 15 | I106 | GA · Hardening | close→`conversation.closed` 集成测试 | [x] |
| 16 | I107 | GA · Docs | `MIGRATION.md` · worker 路径勘误（04/06） | [x] |
| 17 | I108 | GA · KB depth | KB-19 LLM FAQ extract（`KEENAI_CRYSTALLIZE_MODEL` 可选） | [x] |
| 18 | I109 | GA · Product | Dashboard CA 向导 · Help Center Portal | [x] |
| 19 | I110 | GA · Release prep | `CHANGELOG.md` 草案 · Helm · 质量门槛实测 | [x] |
| 20 | I111 | Release **0.1.0** | `v0.1.0` tag · GitHub Release · CHANGELOG | [x] |
| 21 | I112 | Post-0.1.0 hardening | auto-seed · kb-perf baseline · security smoke | [x] |
| 22 | I113 | Import · Intercom HC | `--articles` JSON → `kb_documents` | [x] |
| 23 | I114 | Helm skeleton | `deploy/helm/keenai` Chart + values | [x] |
| 24 | I115 | v0.2.0 · **Phase 0** | 工程地基全量（§P0） | [x] |
| 25 | I116 | v0.2.0 · **Phase 1** | MVP 全量 + 验收（§P1） | [ ] |
| 26 | I117 | v0.2.0 · **Phase 2** | Beta 全量 + 验收（§P2） | [ ] |
| 27 | I118 | v0.2.0 · **Phase 3** | AI 完整版全量 + 验收（§P3） | [ ] |
| 28 | I119 | v0.2.0 · 发布准备 | 质量门槛 · Docker `0.2.0` | [ ] |
| 29 | I120 | Release **v0.2.0** | Phase 0～3 全 `[x]` 后打 tag | [ ] |

**KB Phase A–C（I78～I96）**：KB-07～24  roadmap 已打勾；**实现深度**见 [DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md)（v0.2.0 前须达标，非 stub）。  
**当前主轨**：**I116** Phase 1 → I117 P2 → I118 P3 → I119 → I120 tag。  
**发布门禁**：`08-ROADMAP.md` Phase 0～3 内 **所有** `- [ ]` 项完成 + 各 Phase 验收。

---

## v0.2.0 发布门禁（Phase 0～3 全量 · 强制）

> 与 [08-ROADMAP.md](./08-ROADMAP.md) 各 Phase 未勾选项一一对应。全部 `[x]` 后方可 I120 打 `v0.2.0`。

### Phase 0 · 工程地基（I115）

| ID | 项 | 状态 |
|----|-----|------|
| P0-01 | 包结构：`apps` + `packages` 按路线图齐备（无 `apps/worker`） | [x] |
| P0-02 | Bun 1.2+ + Node 22 fallback 双工具链验证 | [x] |
| P0-03 | GitHub Actions CI/CD（PG + LibSQL 双矩阵） | [x] |
| P0-04 | Fumadocs 文档站（`apps/docs` 生产可托管） | [x] |
| P0-05 | `keenai` CLI 骨架（`bunx keenai` / `pnpm keenai`） | [x] |
| P0-06 | Bun + Node 双 lockfile 兼容性 | [x] |
| P0-07 | Conventional Commits + `commitlint` | [x] |
| P0-08 | CI：Biome → Vitest → 双方言 migrate → API smoke | [x] |
| P0-09 | Sentry / OTel SDK 完整导出 | [x] |
| P0-10 | pino logging（控制台 + JSON 生产） | [x] |
| P0-11 | OTel SDK 完整导出（非 `OTEL_ENABLED` 占位） | [x] |

### Phase 1 · MVP（I116）

| ID | 项 | 状态 |
|----|-----|------|
| P1-01 | IMAP Worker（imapflow · Inngest cron） | [ ] |
| P1-02 | BullMQ `email:send`（重试 + DLQ） | [ ] |
| P1-03 | DKIM 文档与配置工具 | [ ] |
| P1-04 | Anthropic / Ollama LLM Provider | [ ] |
| P1-05 | `@keenai/workflow` Zod DSL + Inngest 模板（生产级） | [ ] |
| P1-06 | Trigger Engine（First Message / Unresponsive） | [ ] |
| P1-07 | Block：`send_message` / `assign` / `close`（生产级） | [ ] |
| P1-08 | Workflow Builder UI（React Flow 单层 → 完整） | [ ] |
| P1-09 | Docker Compose `lite` 单容器跑通 | [ ] |
| P1-10 | `bun build --compile` 单二进制 demo | [ ] |
| P1-11 | Fumadocs 用户文档 + Quickstart 视频 | [ ] |
| P1-12 | Alpha 公开发布验收（社区/文档就绪） | [ ] |
| P1-ACC-01 | 内部客服全程可用 | [ ] |
| P1-ACC-02 | Widget + Email 客户触达 | [ ] |
| P1-ACC-03 | Copilot 采纳率 ≥ 30% | [ ] |
| P1-ACC-04 | `docker compose --profile lite up` < 30s | [ ] |
| P1-ACC-05 | `bun create keenai` 本地启动 < 2min | [ ] |
| P1-ACC-06 | 测试覆盖率 ≥ 70% · CI 绿率 ≥ 95% | [ ] |

### Phase 2 · 核心闭环（I117）

| ID | 项 | 状态 |
|----|-----|------|
| P2-01 | Tickets schema + 3 类型 + 配置 UI | [ ] |
| P2-02 | Convert / Send / Link Workflow Actions | [ ] |
| P2-03 | Ticket Portal `apps/portal` RSC | [ ] |
| P2-04 | 自定义字段 Field DSL | [ ] |
| P2-05 | 邮件通知模板（React Email · 多语言） | [ ] |
| P2-06 | Tracker fan-out 状态同步 | [ ] |
| P2-07 | Workflow 全 Block（`branches` / `http_request` / `wait` / …） | [ ] |
| P2-08 | Workflow 版本 draft→published + Trace | [ ] |
| P2-09 | SLA 50/80/100% + Office Hours | [ ] |
| P2-10 | Workflow Builder 多层 + 配置面板 | [ ] |
| P2-11 | Multimodal MM-01～07（[14-MULTIMODAL.md](./14-MULTIMODAL.md)） | [ ] |
| P2-12 | Feedback schema + Board/Vote/Comment + AI 去重 | [ ] |
| P2-13 | Public Portal SSR/ISR | [ ] |
| P2-14 | Help Center Collections/Articles + 公开 HC + SEO | [ ] |
| P2-15 | AI Search Answers（`@keenai/kb`） | [ ] |
| P2-16 | Slack / Discord 渠道 | [ ] |
| P2-17 | Multi-brand 配置 UI | [ ] |
| P2-18 | 分析看板（ECharts · Support/Feedback/HC） | [ ] |
| P2-19 | Beta 公开发布验收 | [ ] |
| P2-ACC-01 | Featurebase 60% 对齐 | [ ] |
| P2-ACC-02 | ≥3 外部团队试用 | [ ] |
| P2-ACC-03 | Vitest + Playwright e2e ≥ 65% 覆盖 | [ ] |

### Phase 3 · AI 完整版（I118）

| ID | 项 | 状态 |
|----|-----|------|
| P3-01 | `@keenai/memory` 4 层生产实现（非 stub） | [ ] |
| P3-02 | Knowledge Graph extractor（`generateObject`） | [ ] |
| P3-03 | Personality & Branding UI | [ ] |
| P3-04 | Multimodal MM-10～15 Agent 完整版 | [ ] |
| P3-05 | Memory Tree MT-07～09 + Explorer UI | [ ] |
| P3-06 | Dashboard CA 完整 UI · Sandbox · MCP Server expose | [ ] |
| P3-07 | Roadmap Kanban / Timeline | [ ] |
| P3-08 | Changelog 编辑器 + 受众分群 | [ ] |
| P3-09 | Telegram · 钉钉/飞书渠道 | [ ] |
| P3-10 | 国产 LLM 全适配 + Prompt 中文优化 | [ ] |
| P3-11 | 10+ 语言 next-intl | [ ] |
| P3-12 | 视频教程（YouTube / B 站） | [ ] |
| P3-13 | KB-16/18/19/20/22 生产深度（[DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md)） | [ ] |
| P3-14 | Intercom 全量导入（conversations/users，非仅 articles） | [ ] |
| P3-ACC-01 | 自动解决率 ≥ 50% | [ ] |
| P3-ACC-02 | Ollama 完全离线 demo | [ ] |
| P3-ACC-03 | Featurebase 90% 对齐 | [ ] |
| P3-ACC-04 | Mastra Eval faithfulness ≥ 0.85 | [ ] |
| P3-ACC-05 | Recall@5 ≥ 88% · Stale answer < 2% | [ ] |

### 发布仪式（I119～I120）

| ID | 项 | 状态 |
|----|-----|------|
| I119-01 | Recall@5 ≥ 88%（`pnpm kb:eval`） | [ ] |
| I119-02 | CI 全绿 · `pnpm kb:bench` P95 记录 | [ ] |
| I119-03 | GHCR Docker `0.2.0` publish pipeline | [ ] |
| I119-04 | Helm chart 可安装（超越 I114 skeleton） | [ ] |
| I120-01 | `CHANGELOG [0.2.0]` · `docs/releases/v0.2.0.md` | [ ] |
| I120-02 | `git tag v0.2.0` · GitHub Release（prerelease） | [ ] |

---

## 当前迭代 · Iteration 115（v0.2.0 · Phase 0）[ ]

见上表 **§ Phase 0**（P0-01～P0-11）。

---

## 当前迭代 · Iteration 114（Helm skeleton）✓

| ID | 项 | 状态 |
|----|-----|------|
| I114-01 | `deploy/helm/keenai` Chart · values · api/dashboard templates | [x] |
| I114-02 | `helm lint` passes | [x] |

---

## 当前迭代 · Iteration 113（Intercom HC import）✓

| ID | 项 | 状态 |
|----|-----|------|
| I113-01 | `import intercom --articles` → `kb_documents` | [x] |
| I113-02 | unit test + `MIGRATION.md` | [x] |

---

## 当前迭代 · Iteration 112（Post-0.1.0 hardening）✓

| ID | 项 | 状态 |
|----|-----|------|
| I112-01 | `KEENAI_AUTO_SEED` 生产默认关 · compose 可覆盖 | [x] |
| I112-02 | `kb-perf.yaml` baseline P95 记录 | [x] |
| I112-03 | Security smoke（JWT · widget HMAC · upload presign） | [x] |
| I112-04 | `GA.md` / `08-ROADMAP.md` 指针更新 | [x] |

---

## 当前迭代 · Iteration 111（Release 0.1.0）✓

| ID | 项 | 状态 |
|----|-----|------|
| I111-01 | 版本号 `0.1.0` · CHANGELOG · `docs/releases/v0.1.0.md` | [x] |
| I111-02 | `git tag v0.1.0` · GitHub Release workflow | [x] |

---

## 当前迭代 · Iteration 109～110（GA · Dashboard + release prep）✓

| ID | 项 | 状态 |
|----|-----|------|
| I109 | `/custom-actions` 4-step wizard stub + `/help-center` KB search | [x] |
| I110 | `CHANGELOG.md` + `deploy/helm/README.md` 规划 | [x] |

---

## 当前迭代 · Iteration 107～108（GA · docs + KB-19 LLM extract）✓

| ID | 项 | 状态 |
|----|-----|------|
| I107 | `04-MODULES` / `06-TECH-STACK` worker → API/Inngest 路径勘误 | [x] |
| I108 | `extractKbCrystallizeFaq` + `KEENAI_CRYSTALLIZE_MODEL` | [x] |

---

## 当前迭代 · Iteration 71（Phase 8 · Sprint 13–14 · Auto-close + CSAT stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I71-01 | Auto-close + CSAT Inngest timer stub | [x] |
| I71-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 72（Phase 8 · Sprint 13–14 · Memory Tree MT-01 stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I72-01 | Memory Tree `memory_chunks` canonicalize stub | [x] |
| I72-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 73（Phase 8 · Sprint 13–14 · Memory Tree MT-02 fast-score stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I73-01 | Memory Tree fast-score + extract_chunk enqueue stub | [x] |
| I73-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 74（Phase 8 · Sprint 13–14 · Memory Tree MT-03 buffer stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I74-01 | Memory Tree source tree buffer + seal stub | [x] |
| I74-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 75（Phase 8 · Sprint 13–14 · Memory Tree MT-04 digest stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I75-01 | Memory Tree `memory.digest_daily` brand daily stub | [x] |
| I75-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 76（Phase 8 · Sprint 13–14 · Memory Tree MT-05 retrieval stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I76-01 | Memory Tree retrieval scope stub（conversation / customer / brand_daily） | [x] |
| I76-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 77（Phase 8 · Sprint 13–14 · Memory Tree MT-06 agent scope stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I77-01 | Agent scope routing stub（09 附录 B · assembleMemoryContext） | [x] |
| I77-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 78（KB Phase A · KB-07 bge-m3 embedder）✓

| ID | 项 | 状态 |
|----|-----|------|
| I78-01 | `@xenova/transformers` bge-m3 真实 embedder | [x] |
| I78-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 79（KB Phase A · KB-08 reranker）✓

| ID | 项 | 状态 |
|----|-----|------|
| I79-01 | bge-reranker-v2-m3 reranker | [x] |
| I79-02 | tests · roadmap · commit · push | [x] |

---

## 当前迭代 · Iteration 104～106（GA · CSAT + import + tests）✓

| ID | 项 | 状态 |
|----|-----|------|
| I104 | PATCH/widget `rating` · crystallize 需显式 CSAT（无默认 5） | [x] |
| I105 | `keenai import zendesk --kb` → `kb_documents` | [x] |
| I106 | `kb-dispatch.integration.test.ts` close + CSAT | [x] |

---

## 当前迭代 · Iteration 101～103（Sprint 18 · GA prep）✓

| ID | 项 | 状态 |
|----|-----|------|
| I101 | `keenai import` intercom/zendesk stub | [x] |
| I102 | Mastra eval judge hook (`mastra-judge.ts`) | [x] |
| I103 | `docs/index.md` + `docs/GA.md` | [x] |

---

## Iteration 99～100（Sprint 18 · perf + deploy docs）✓

| ID | 项 | 状态 |
|----|-----|------|
| I99 | autocannon `pnpm kb:bench` + `kb-perf.yaml` + query_logs index | [x] |
| I100 | `DEPLOYMENT.md` + `MIGRATION.md` stub | [x] |

---

## Iteration 97～98（Sprint 18 · KB golden eval）✓

| ID | 项 | 状态 |
|----|-----|------|
| I97 | Eval scorers stub（faithfulness / relevance / contextual recall） | [x] |
| I98 | `runKbGoldenEval` + API `/kb/eval/*` + nightly CI | [x] |

---

## Iteration 91～96（KB Phase C · Compounding 闭环）✓

| ID | 项 | 状态 |
|----|-----|------|
| I91 | KB-19 Crystallization pipeline | [x] |
| I92 | KB-20 Contradiction reconcile | [x] |
| I93 | KB-21 Brand KB Schema | [x] |
| I94 | KB-22 Unified Context Orchestrator | [x] |
| I95 | KB-23 Eval 闭环 + metrics | [x] |
| I96 | KB-24 hotness → crystallize priority | [x] |

---

## Iteration 84～90（KB Phase B · 知识生命周期）✓

| ID | 项 | 状态 |
|----|-----|------|
| I84 | KB-13 provenance + confidence | [x] |
| I85 | KB-14 supersession chain | [x] |
| I86 | KB-15 freshness rules | [x] |
| I87 | KB-16 Inngest kb-ingest | [x] |
| I88 | KB-17 diff index | [x] |
| I89 | KB-18 parsers/chunkers stub | [x] |
| I90 | KG-05 entity extractor | [x] |

---

## Iteration 83（KB Phase A · KB-12 query logs + feedback）✓

| ID | 项 | 状态 |
|----|-----|------|
| I83-01 | `kb_query_logs` + `POST /kb/search/:id/feedback` | [x] |
| I83-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 82（KB Phase A · KB-11 diversify + recency）✓

| ID | 项 | 状态 |
|----|-----|------|
| I82-01 | Diversity + Recency 后置（`applyKbSearchPostFuse`） | [x] |
| I82-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 81（KB Phase A · KB-10 hierarchical hydrate）✓

| ID | 项 | 状态 |
|----|-----|------|
| I81-01 | Hierarchical chunk hydrate（`hydrateKbSearchHits`） | [x] |
| I81-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 80（KB Phase A · KB-09 graph expand）✓

| ID | 项 | 状态 |
|----|-----|------|
| I80-01 | KG entity-link expansion（第三检索流） | [x] |
| I80-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 72（Phase 8 · Sprint 13–14 · Memory Tree MT-01 stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I70-01 | Memory consolidation Inngest cron stub | [x] |
| I70-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 69（Phase 8 · Sprint 13–14 · Memory processors stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I69-01 | Mastra processors stub（PiiFilter / TrajectoryCompressor / ConfidenceFilter） | [x] |
| I69-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 68（Phase 8 · Sprint 13–14 · Memory Mastra 接入）✓

| ID | 项 | 状态 |
|----|-----|------|
| I68-01 | `@keenai/memory` Mastra adapter stub | [x] |
| I68-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 67（Phase 8 · Sprint 13–14 · WF-01 Let Keeni Answer block）✓

| ID | 项 | 状态 |
|----|-----|------|
| I67-01 | Workflow `let_keeni_answer` block + API wiring | [x] |
| I67-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 66（Phase 8 · Sprint 13–14 · AE-04 Skill system stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I66-01 | Skill system stub | [x] |
| I66-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 65（Phase 8 · Sprint 13–14 · AE-03 Resolution + post-run hooks）✓

| ID | 项 | 状态 |
|----|-----|------|
| I65-01 | Resolution 检测 + post-run hooks | [x] |
| I65-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 64（Phase 8 · Sprint 13–14 · AE-02 Mastra 接入）✓

| ID | 项 | 状态 |
|----|-----|------|
| I64-01 | Mastra `@mastra/core/agent` 接入 | [x] |
| I64-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 63（Phase 8 · Sprint 13–14 · Keeni Agent AE-01）✓

| ID | 项 | 状态 |
|----|-----|------|
| I63-01 | `@keenai/agent` 包 skeleton + Mastra adapter stub | [x] |
| I63-02 | tests · roadmap · commit · push | [x] |

---

## Phase 8 · Sprint 13–14 · Keeni AI Agent（AE-01～）

| AE | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **AE-01** | I63 | `@keenai/agent` skeleton + run wrapper | [x] |
| **AE-02** | I64 | Mastra `@mastra/core/agent` 接入 | [x] |
| **AE-03** | I65 | Resolution 检测 + post-run hooks | [x] |
| **AE-04** | I66 | Skill system stub | [x] |

---

## Phase 7 收尾（Sprint 16 · Custom Actions + MCP）✓

| ID | 项 | 状态 |
|----|-----|------|
| I62-01 | MCP Host mode stub（`@modelcontextprotocol/sdk`） | [x] |
| I62-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 62（Phase 7 · Custom Actions CA-06 · MCP Host stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I62-01 | MCP Host mode stub（`@modelcontextprotocol/sdk`） | [x] |
| I62-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 61（Phase 7 · Custom Actions CA-05 · call logs）✓

| ID | 项 | 状态 |
|----|-----|------|
| I61-01 | Action call logs（Drizzle + OTel span stub） | [x] |
| I61-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 60（Phase 7 · Custom Actions CA-04 · AI SDK tools）✓

| ID | 项 | 状态 |
|----|-----|------|
| I60-01 | Vercel AI SDK `tool()` wire into copilot/agent | [x] |
| I60-02 | tests · roadmap · commit · push | [x] |

---

## Phase 7 · 迭代执行清单（Sprint 16）

| 迭代 | CA | 交付 | 状态 |
|------|-----|------|------|
| I57 | CA-01 | `custom_actions` schema + migration | [x] |
| I58 | CA-02 | Custom Action REST CRUD API | [x] |
| I59 | CA-03 | HMAC signing + `http_direct` executor | [x] |
| I60 | CA-04 | AI SDK `tool()` → Copilot | [x] |
| **I61** | **CA-05** | Action call logs | [x] |
| **I62** | **CA-06** | MCP Host mode stub | [x] |

---

## Iteration 59（Phase 7 · Custom Actions CA-03 · executor stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I59-01 | HMAC signing + `http_direct` executor stub | [x] |
| I59-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 58（Phase 7 · Custom Actions CA-02 · REST API）✓

| ID | 项 | 状态 |
|----|-----|------|
| I58-01 | Custom Action REST CRUD API | [x] |
| I58-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 57（Phase 7 · Custom Actions CA-01 · schema）✓

| ID | 项 | 状态 |
|----|-----|------|
| I57-01 | `custom_actions` schema + migration | [x] |
| I57-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 56（Phase 6 收尾 / 下一阶段规划）✓

| ID | 项 | 状态 |
|----|-----|------|
| I56-01 | Phase 6 KB/RAG 收尾检查 | [x] |
| I56-02 | roadmap · commit · push | [x] |

**Phase 6 验收（KB-01～06）**

| 检查项 | 状态 |
|--------|------|
| `@keenai/kb` package + migrations `0021`–`0023` | [x] |
| `GET /api/v1/kb/search` + OpenAPI 条目 | [x] |
| `assembleMemoryContext` · `kb_only` + Copilot 注入 | [x] |
| 集成测试（`kb.integration` · `memory-retrieval` kb_only） | [x] |
| `pnpm lint` · `typecheck` · `test` 全绿 | [x] |

**Phase 7 预告（Sprint 16 · Custom Actions + MCP）**

| CA | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **CA-01** | I57 | `custom_actions` schema + migration | [x] |
| **CA-02** | I58 | Custom Action REST CRUD API | [x] |
| **CA-03** | I59 | HMAC signing + `http_direct` executor stub | [x] |
| **CA-04** | I60 | Vercel AI SDK `tool()` wire into copilot/agent | [x] |
| **CA-05** | I61 | Action call logs（Drizzle + OTel span stub） | [x] |
| **CA-06** | I62 | MCP Host mode stub（`@modelcontextprotocol/sdk`） | [x] |

---

## Iteration 55（KB / RAG KB-06 · Agent KB context）✓

| ID | 项 | 状态 |
|----|-----|------|
| I55-01 | Agent context 注入 KB 段落 | [x] |
| I55-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 54（KB / RAG KB-05 · GET /kb/search API）✓

| ID | 项 | 状态 |
|----|-----|------|
| I54-01 | `GET /kb/search` API | [x] |
| I54-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 53（KB / RAG KB-04 · hybrid retriever）✓

| ID | 项 | 状态 |
|----|-----|------|
| I53-01 | Hybrid retriever（FTS + Vector RRF） | [x] |
| I53-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 52（KB / RAG KB-03 · ingestion pipeline stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I52-01 | Ingestion pipeline step 1–3（parse → chunk → embed stub） | [x] |
| I52-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 51（KB / RAG KB-02 · source connector stub）✓

| ID | 项 | 状态 |
|----|-----|------|
| I51-01 | Help Center / Web source connector stub | [x] |
| I51-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 50（KB / RAG KB-01 · @keenai/kb skeleton）✓

| ID | 项 | 状态 |
|----|-----|------|
| I50-01 | `@keenai/kb` package skeleton + schema stub | [x] |
| I50-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 49（Knowledge Graph KG-04 · graph API）✓

| ID | 项 | 状态 |
|----|-----|------|
| I49-01 | `GET /memory/graph/related` API | [x] |
| I49-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 48（Knowledge Graph KG-03 · relatedTopics query）✓

| ID | 项 | 状态 |
|----|-----|------|
| I48-01 | `relatedTopics` 递归 CTE 查询 | [x] |
| I48-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 47（Knowledge Graph KG-02 · relation extractor）✓

| ID | 项 | 状态 |
|----|-----|------|
| I47-01 | seal 后 relation 抽取 stub + persist | [x] |
| I47-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 46（Knowledge Graph KG-01 · memory_relations schema）✓

| ID | 项 | 状态 |
|----|-----|------|
| I46-01 | `memory_relations` schema + migration | [x] |
| I46-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 45（Keeni Memory KM-13 · export CLI）✓

| ID | 项 | 状态 |
|----|-----|------|
| I45-01 | `keenai memory export --vault` CLI | [x] |
| I45-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 44（Keeni Memory KM-12 · @keenai/memory facade）✓

| ID | 项 | 状态 |
|----|-----|------|
| I44-01 | `@keenai/memory` facade API | [x] |
| I44-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 43（Keeni Memory KM-11 · consolidation/decay）✓

| ID | 项 | 状态 |
|----|-----|------|
| I43-01 | consolidation/decay Inngest cron | [x] |
| I43-02 | eviction 分数 | [x] |
| I43-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 42（Keeni Memory KM-10 · flush_stale + entities）✓

| ID | 项 | 状态 |
|----|-----|------|
| I42-01 | `flush_stale` buffer cron | [x] |
| I42-02 | `memory_entities` 实体抽取 stub | [x] |
| I42-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 41（Keeni Memory KM-09 · ingest privacy filter）✓

| ID | 项 | 状态 |
|----|-----|------|
| I41-01 | PII 脱敏 processor（ingest 路径） | [x] |
| I41-02 | tests · roadmap · commit · push | [x] |

---

## Iteration 40（Keeni Memory KM-08 · facts API + L3 context）✓

| ID | 项 | 状态 |
|----|-----|------|
| I40-01 | `GET /memory/facts` API | [x] |
| I40-02 | `assembleMemoryContext` 注入 slots/facts | [x] |
| I40-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 39（Keeni Memory KM-07 · memory_facts + memory_slots）✓

| ID | 项 | 状态 |
|----|-----|------|
| I39-01 | `memory_facts` + `memory_slots` schema + migration | [x] |
| I39-02 | seal 后 LLM 抽取 facts（Inngest） | [x] |
| I39-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 38（Keeni Memory KM-06 · summaries FTS）✓

| ID | 项 | 状态 |
|----|-----|------|
| I38-01 | `fts_memory_summaries` 虚拟表 + migration | [x] |
| I38-02 | 搜索覆盖 seal 摘要与日 digest | [x] |
| I38-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 37（Keeni Memory KM-05 · hybrid recall）✓

| ID | 项 | 状态 |
|----|-----|------|
| I37-01 | `searchMemoryChunks` 接入 FTS + Vector RRF | [x] |
| I37-02 | Explorer/API 返回 fused score | [x] |
| I37-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 36（Keeni Memory KM-04 · chunk vectors）✓

| ID | 项 | 状态 |
|----|-----|------|
| I36-01 | `memory_chunk_vectors` 表 + migration | [x] |
| I36-02 | admit 后 embed pipeline（stub / OpenAI env） | [x] |
| I36-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 35（Keeni Memory KM-03 · FTS memory search）✓

| ID | 项 | 状态 |
|----|-----|------|
| I35-01 | `searchMemoryChunks` 改 FTS（替换 SQL LIKE） | [x] |
| I35-02 | Explorer/API 返回 FTS score + snippet | [x] |
| I35-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 34（Keeni Memory KM-02 · FTS memory chunks）✓

| ID | 项 | 状态 |
|----|-----|------|
| I34-01 | `fts_memory_chunks` 虚拟表 + migration | [x] |
| I34-02 | ingest 时 FTS index + ensure schema | [x] |
| I34-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 33（Keeni Memory KM-01 · Hybrid RRF 基础）✓

> **目标**：KeenAI **内置** agentmemory 对应能力（LibSQL + `@keenai/memory-tree`），不依赖外部 daemon。  
> 设计对照：[10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md) · [12-STORAGE-ABSTRACTION.md](./12-STORAGE-ABSTRACTION.md) §5.5

| ID | 项 | 状态 |
|----|-----|------|
| I33-01 | `packages/storage`：`rrfFuse` + `hybridSearch` 纯函数 + 单元测试 | [x] |
| I33-02 | 导出 `@keenai/storage` hybrid API | [x] |
| I33-03 | roadmap · lint/typecheck/test · commit · push | [x] |

---

## Phase 4 · Keeni Memory 原生（KM-01～KM-11）

对标 [agentmemory](https://github.com/rohitg00/agentmemory) **能力**，全部落在 KeenAI 自有存储与 Inngest 管线。

| KM | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KM-01** | I33 | `rrfFuse` + `hybridSearch`（storage 层，FTS/Vector 结果融合） | [x] |
| **KM-02** | I34 | `fts_memory_chunks` 虚拟表 + migration；ingest 时 FTS index | [x] |
| **KM-03** | I35 | `searchMemoryChunks` 改 FTS（替换 SQL LIKE）+ API/集成测试 | [x] |
| **KM-04** | I36 | `memory_chunk_vectors` 表 + admit 后 embed（stub / OpenAI env） | [x] |
| **KM-05** | I37 | Memory 混合检索：FTS + Vector RRF；`GET /memory/search` 返回 fused score | [x] |
| **KM-06** | I38 | `fts_memory_summaries` + 搜索覆盖 seal 摘要与日 digest | [x] |
| **KM-07** | I39 | `memory_facts` + `memory_slots` schema；seal 后 LLM 抽取 facts（Inngest） | [x] |
| **KM-08** | I40 | `GET /memory/facts` + `assembleMemoryContext` 注入 L3 slots/facts | [x] |
| **KM-09** | I41 | ingest privacy filter（PII 脱敏 processor） | [x] |
| **KM-10** | I42 | `flush_stale` buffer cron + `memory_entities` 实体抽取 stub | [x] |
| **KM-11** | I43 | consolidation/decay Inngest cron + eviction 分数 | [x] |
| **KM-12** | I44 | `@keenai/memory` facade：`store` / `recall` / `get` / `forget` 统一 API | [x] |
| **KM-13** | I45 | `keenai memory export --vault` CLI → Markdown vault | [x] |

### 依赖关系（简图）

```
KM-01 RRF ──► KM-02 FTS index ──► KM-03 search 升级
                      │
KM-04 vectors ──► KM-05 hybrid recall ──► KM-06 summaries FTS
KM-07 facts/slots ──► KM-08 Agent L3 context
KM-09 privacy ──► KM-10 flush + entities ──► KM-11 consolidation
KM-12 memory package ──► KM-13 export CLI
```

---

## Phase 5 · Knowledge Graph（KG-01～04）

对标 [10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md) §9，在 KM-10 实体 stub 之上补齐关系图谱。

| KG | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KG-01** | I46 | `memory_relations` schema + migration | [x] |
| **KG-02** | I47 | seal 后 relation 抽取 stub + persist | [x] |
| **KG-03** | I48 | `relatedTopics` 递归 CTE 查询 | [x] |
| **KG-04** | I49 | `GET /memory/graph/related` API + Explorer 链接 | [x] |

### 依赖关系（简图）

```
KM-10 entities ──► KG-01 relations schema ──► KG-02 extract + persist
KG-02 ──► KG-03 relatedTopics query ──► KG-04 graph API
```

---

## Phase 6 · KB / RAG（KB-01～06）

对标 [08-ROADMAP.md](./08-ROADMAP.md) Sprint 15 · [11-RAG-KNOWLEDGE.md](./11-RAG-KNOWLEDGE.md) · 后续优化 [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md)

| KB | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KB-01** | I50 | `@keenai/kb` package skeleton + `kb_documents` schema | [x] |
| **KB-02** | I51 | Help Center / Web source connector stub | [x] |
| **KB-03** | I52 | Ingestion pipeline step 1–3（parse → chunk → embed stub） | [x] |
| **KB-04** | I53 | Hybrid retriever（FTS + Vector RRF） | [x] |
| **KB-05** | I54 | `GET /kb/search` API | [x] |
| **KB-06** | I55 | Agent context 注入 KB 段落 | [x] |

### 与 Memory Tree 已完成项的关系

| 已有（MT-01～09） | Phase 4 增强 |
|-------------------|-------------|
| `memory_chunks` ingest + fast-score | + FTS/Vector 索引 |
| seal → `memory_summaries` / episodes | + 摘要可检索 + fact 抽取 |
| `assembleMemoryContext` scope 路由 | + L3 facts/slots + hybrid recall |
| Explorer `LIKE` 搜索 | → FTS → hybrid RRF |
| ~~MT-10 外部 daemon~~ | **取消**；能力由 KM-* 原生实现 |

### Phase 6 后续 backlog（→ [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md)）

已拆分为 KB-RAG Phase A/B/C（KB-07～24），见下方 **KB 优化 · Phase A/B/C**。

---

## KB 优化 · Phase A — 检索质量（KB-07～12）

对标 [08-ROADMAP.md](./08-ROADMAP.md) Sprint 15 · [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) §三

| KB | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KB-07** | I78 | `@xenova/transformers` bge-m3 真实 embedder | [x] |
| **KB-09** | I80 | KG entity-link expansion（第三检索流） | [x] |
| **KB-08** | I79 | bge-reranker-v2-m3 reranker | [x] |
| **KB-10** | I81 | Hierarchical chunk hydrate | [x] |
| **KB-11** | I82 | Diversity + Recency 后置 | [x] |
| **KB-12** | I83 | `kb_query_logs` + feedback API | [x] |

**Phase A 验收**：Recall@5 ≥ 88% · Precision@5 ≥ 90% · P95 < 200ms

### 依赖

```
KB-04（RRF baseline）──► KB-07 embedder ──► KB-08 reranker
                              │
                              └──► KB-09 ◄── KG-05（kb_entities）
                                       └──► KB-10 → KB-11 → KB-12
```

---

## KB 优化 · Phase B — 知识生命周期（KB-13～18 · KG-05）

对标 [08-ROADMAP.md](./08-ROADMAP.md) Sprint 16 并行轨 · [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) §四

| KB | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KB-13** | I84 | Evidence-based confidence + provenance | [x] |
| **KB-14** | I85 | Supersession chain | [x] |
| **KB-15** | I86 | Freshness rules → retrievalWeight | [x] |
| **KB-16** | I87 | Inngest 8 阶段 ingestion pipeline | [x] |
| **KB-17** | I88 | content_hash diff 增量索引 | [x] |
| **KB-18** | I89 | Parsers + semantic/hierarchical/contextual chunkers | [x] |
| **KG-05** | I90 | `kb_entities` / `kb_relations` + KB ingest extractor | [x] |

**Phase B 验收**：Stale answer rate < 5% · 增量索引 chunk_id 稳定 · Inngest 编排 ingestion

---

## KB 优化 · Phase C — Compounding 闭环（KB-19～24）

对标 [08-ROADMAP.md](./08-ROADMAP.md) Sprint 17–18 · [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) §五

| KB | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KB-19** | I91 | Crystallization pipeline | [x] |
| **KB-20** | I92 | Contradiction reconcile + supersession propose | [x] |
| **KB-21** | I93 | Brand KB Schema | [x] |
| **KB-22** | I94 | Unified Context Orchestrator | [x] |
| **KB-23** | I95 | Eval 闭环 + lifecycle metrics | [x] |
| **KB-24** | I96 | Memory Tree hotness → crystallize 优先级 | [x] |

**Phase C 验收**：Recall@5 ≥ 92% · Crystallization accept ≥ 60% · graph contribution ≥ 25%

---

## Phase 7 · Custom Actions + MCP（CA-01～06）

对标 [08-ROADMAP.md](./08-ROADMAP.md) Sprint 16

| CA | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **CA-01** | I57 | `custom_actions` schema + migration | [x] |
| **CA-02** | I58 | Custom Action REST CRUD API | [x] |
| **CA-03** | I59 | HMAC signing + `http_direct` executor stub | [x] |
| **CA-04** | I60 | Vercel AI SDK `tool()` wire into copilot/agent | [x] |
| **CA-05** | I61 | Action call logs（Drizzle + OTel span stub） | [x] |
| **CA-06** | I62 | MCP Host mode stub | [x] |

---

## Iteration 32（Memory Tree MT-10 — 已移除）

> agentmemory daemon 集成已回滚；KeenAI 仅保留 LibSQL Memory Tree。

| ID | 项 | 状态 |
|----|-----|------|
| I32-01 | AgentMemoryClient + remember/smart-search mapping | [-] |
| I32-02 | seal/digest sync hook + runtime config | [-] |
| I32-03 | GET /memory/agentmemory/health + recall | [-] |
| I32-04 | Dashboard hybrid recall UI | [-] |

---

## Iteration 31（Memory Tree MT-09）

| ID | 项 | 状态 |
|----|-----|------|
| I31-01 | channelScopeKey + channelRouteChunk pipeline | [x] |
| I31-02 | queryChannelMemoryTree + GET /memory/tree?scope=channel | [x] |
| I31-03 | slack/telegram ingest metadata + explorer search | [x] |
| I31-04 | tests · roadmap · commits | [x] |

---

## Iteration 30（Memory Tree MT-08）

| ID | 项 | 状态 |
|----|-----|------|
| I30-01 | queryMemoryExplorerStats + searchMemoryChunks API | [x] |
| I30-02 | GET /memory/stats + GET /memory/search | [x] |
| I30-03 | Dashboard Memory Explorer page | [x] |
| I30-04 | tests · roadmap · commits | [x] |

---

## Iteration 29（Memory Tree MT-07）

| ID | 项 | 状态 |
|----|-----|------|
| I29-01 | memory_hotness schema + refreshCustomerHotness | [x] |
| I29-02 | topicRouteChunk + customer topic buffer/seal | [x] |
| I29-03 | queryCustomerMemoryTree + assemble customer scope | [x] |
| I29-04 | GET /memory/tree?scope=customer + tests · commits | [x] |

---

## Iteration 28（Memory Tree MT-06）

| ID | 项 | 状态 |
|----|-----|------|
| I28-01 | resolveMemoryScope + assembleMemoryContext | [x] |
| I28-02 | Copilot draft memoryContext + memoryScope meta | [x] |
| I28-03 | GET /memory/context + tests | [x] |
| I28-04 | roadmap · commits | [x] |

---

## Iteration 27（Memory Tree MT-05）

| ID | 项 | 状态 |
|----|-----|------|
| I27-01 | queryConversationMemoryTree + queryBrandDailyDigest | [x] |
| I27-02 | GET /memory/tree + GET /memory/digest routes | [x] |
| I27-03 | shared query schemas + integration tests | [x] |
| I27-04 | roadmap · commits | [x] |

---

## Iteration 26（Memory Tree MT-04）

| ID | 项 | 状态 |
|----|-----|------|
| I26-01 | brandDailyScopeKey + stubDailyDigest | [x] |
| I26-02 | digestDailyForBrand + runDigestDaily | [x] |
| I26-03 | Inngest digest_daily cron + event | [x] |
| I26-04 | tests · roadmap · commits | [x] |

---

## Iteration 25（Memory Tree MT-03）

| ID | 项 | 状态 |
|----|-----|------|
| I25-01 | memory_tree_buffers + memory_summaries + memory_episodes schema | [x] |
| I25-02 | appendBuffer + sealBuffer + stub seal | [x] |
| I25-03 | processAdmittedChunk pipeline + dispatch wiring | [x] |
| I25-04 | buffer/seal tests · roadmap · commits | [x] |

---

## Iteration 24（Memory Tree MT-02）

| ID | 项 | 状态 |
|----|-----|------|
| I24-01 | fast_score column + migration | [x] |
| I24-02 | computeFastScore + applyFastScoreToChunk | [x] |
| I24-03 | extract_chunk stub + memory dispatch | [x] |
| I24-04 | integration tests · roadmap · commits | [x] |

---

## Iteration 23（Memory Tree MT-01）

| ID | 项 | 状态 |
|----|-----|------|
| I23-01 | memory_chunks schema + migration | [x] |
| I23-02 | @keenai/memory-tree canonicalize + persist | [x] |
| I23-03 | message ingest hook + integration tests | [x] |

---

## Iteration 22（Telegram/Slack IM 多模态 · MM-15）

| ID | 项 | 状态 |
|----|-----|------|
| I22-01 | @keenai/channels-im inbound/outbound adapters | [x] |
| I22-02 | IM webhooks + ingest + outbound plan API | [x] |
| I22-03 | integration tests · commits | [x] |

---

## Iteration 21（Memory Tree 设计 · 文档）

| ID | 项 | 状态 |
|----|-----|------|
| I21-00 | [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) + 关联 doc/roadmap 更新 | [x] |
| I21-01 | `memory_chunks` schema + canonicalize（MT-01） | [x] |
| I21-02 | fast-score + admitted/dropped（MT-02） | [x] |
| I21-03 | source tree seal → episodes（MT-03） | [x] |

---

## Phase 3 · Multimodal Agent 完整版

| MM ID | 项 | 状态 |
|-------|-----|------|
| MM-10 | STT transcribe pipeline | [x] |
| MM-11 | video thumbnail + 播放 | [x] |
| MM-12 | parseAgentResponse + Keeni outbound 图 | [x] |
| MM-13 | TTS tool + audio 出站 | [x] |
| MM-14 | generate_image tool | [x] |
| MM-15 | Telegram/Slack IM 多模态 | [x] |

## Phase 3 · Memory Tree（[15-MEMORY-TREE.md](./15-MEMORY-TREE.md)）

| MT ID | 项 | 状态 |
|-------|-----|------|
| MT-01 | memory_chunks + canonicalize + deterministic id | [x] |
| MT-02 | fast-score + extract_chunk + admitted/dropped | [x] |
| MT-03 | source tree conv:* buffer + seal → episodes | [x] |
| MT-04 | memory.digest_daily global node | [x] |
| MT-05 | 检索 API drill_down + brand_daily | [x] |
| MT-06 | Agent scope 路由（09 附录 B） | [x] |
| MT-07 | topic tree + hotness | [x] |
| MT-08 | Memory Explorer Dashboard MVP | [x] |
| MT-09 | channel-scoped source tree | [x] |
| MT-10 | ~~agentmemory daemon~~ | [-] 已移除；见 Phase 4 KM-* |

## Phase 4 · Keeni Memory 原生（[10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md)）

| KM ID | 项 | 状态 |
|-------|-----|------|
| KM-01 | hybrid RRF（storage） | [x] |
| KM-02 | fts_memory_chunks + ingest index | [x] |
| KM-03 | FTS memory search | [x] |
| KM-04 | chunk vectors + embed | [x] |
| KM-05 | hybrid FTS+Vector recall | [x] |
| KM-06 | summaries FTS search | [x] |
| KM-07 | memory_facts + memory_slots | [x] |
| KM-08 | L3 context API | [x] |
| KM-09 | privacy filter ingest | [x] |
| KM-10 | flush_stale + entities | [x] |
| KM-11 | consolidation + decay | [x] |
| KM-12 | @keenai/memory facade | [x] |
| KM-13 | export CLI | [x] |

## Phase 5 · Knowledge Graph（[10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md) §9）

| KG ID | 项 | 状态 |
|-------|-----|------|
| KG-01 | memory_relations schema | [x] |
| KG-02 | relation extractor + persist | [x] |
| KG-03 | relatedTopics recursive query | [x] |
| KG-04 | GET /memory/graph/related API | [x] |
| KG-05 | kb_entities / kb_relations（KB 侧 · 见 [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md)） | [x] |

## Phase 6 · KB / RAG（[11-RAG-KNOWLEDGE.md](./11-RAG-KNOWLEDGE.md) · 优化 [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md)）

| KB ID | 项 | 状态 |
|-------|-----|------|
| KB-01 | @keenai/kb package skeleton | [x] |
| KB-02 | source connector stub | [x] |
| KB-03 | ingestion pipeline parse/chunk/embed | [x] |
| KB-04 | hybrid retriever | [x] |
| KB-05 | GET /kb/search API | [x] |
| KB-06 | Agent KB context injection | [x] |

## KB 优化 · Phase A（[11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) §三 · I78～I83）

| KB ID | 项 | 状态 |
|-------|-----|------|
| KB-07 | bge-m3 real embedder | [x] |
| KB-08 | bge-reranker reranker | [x] |
| KB-09 | graph entity-link expansion | [x] |
| KB-10 | hierarchical chunk hydrate | [x] |
| KB-11 | diversity + recency | [x] |
| KB-12 | kb_query_logs + feedback API | [x] |

## KB 优化 · Phase B（[11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) §四 · I84～I90）

| KB ID | 项 | 状态 |
|-------|-----|------|
| KB-13 | provenance + evidence confidence | [x] |
| KB-14 | supersession chain | [x] |
| KB-15 | freshness → retrievalWeight | [x] |
| KB-16 | Inngest 8-step ingestion | [x] |
| KB-17 | content_hash diff index | [x] |
| KB-18 | parsers + advanced chunkers | [x] |
| KG-05 | kb_entities / kb_relations | [x] |

## KB 优化 · Phase C（[11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) §五 · I91～I96）

| KB ID | 项 | 状态 |
|-------|-----|------|
| KB-19 | crystallization pipeline | [x] |
| KB-20 | contradiction reconcile | [x] |
| KB-21 | brand KB schema | [x] |
| KB-22 | unified context orchestrator | [x] |
| KB-23 | eval loop + lifecycle metrics | [x] |
| KB-24 | MT hotness → crystallize priority | [x] |

## Phase 7 · Custom Actions + MCP（[08-ROADMAP.md](./08-ROADMAP.md) Sprint 16）

| CA ID | 项 | 状态 |
|-------|-----|------|
| CA-01 | custom_actions schema | [x] |
| CA-02 | Custom Action REST CRUD API | [x] |
| CA-03 | HMAC signing + http_direct executor | [x] |
| CA-04 | AI SDK tool() copilot/agent wire | [x] |
| CA-05 | Action call logs | [x] |
| CA-06 | MCP Host mode stub | [x] |

---

见 [08-ROADMAP.md](./08-ROADMAP.md) · [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) · [14-MULTIMODAL.md](./14-MULTIMODAL.md) · [ALPHA.md](./ALPHA.md).
