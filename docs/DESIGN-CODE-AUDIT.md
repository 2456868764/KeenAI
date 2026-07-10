# Design ↔ Code Audit (0.1.x / 0.2.x)

> Last updated: 2026-05-19 · Sprint 18 GA prep.  
> Roadmap marks many KB/CA items **[x]**; this doc records **implementation depth** vs design docs.

## Summary

| Area | Doc status | Code reality |
|------|------------|--------------|
| KB Phase A–C (KB-07～24) | Done in [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) | Core paths exist; several steps are **stub/heuristic** |
| Custom Actions (CA-01～06) | Done | API + copilot tools + logs + MCP host **stub**; Dashboard wizard UI not built |
| Events | `keenai/conversation.closed` in KB design | **Fixed (P0):** emitted on PATCH close + workflow `close` |
| Crystallize `auto_index` | Index into searchable KB | **Fixed (P0):** `runKbCrystallizeJob` calls `indexDocument` after insert |
| KB-23 metrics | Recall@5 on `/kb/eval/metrics` | **Fixed (P0):** `?includeGolden=true` merges golden eval |
| Help Center | README “Planned” | KB `help_center` connector stub + search; no standalone portal |

## P0 fixes (2026-05-19)

1. **`keenai/conversation.closed`** — `dispatchKbConversationClosed` from `apps/api/src/lib/kb-dispatch.ts` on conversation PATCH → `closed` and workflow engine `close`.
2. **Crystallize indexing** — `apps/api/src/lib/kb-crystallize-pipeline.ts` runs `kb.indexDocument` when gate is `auto_index`.
3. **Metrics merge** — `GET /api/v1/kb/eval/metrics?includeGolden=true` runs `runKbGoldenEval` + `enrichKbEvalMetricsFromGolden`.

## Path drift (docs → code)

| Doc reference | Actual location |
|---------------|-----------------|
| `apps/worker/src/jobs/kb-ingest.ts` | `packages/kb/src/inngest/kb-ingest.ts`, wired via `apps/api/src/lib/kb-inngest.ts` |
| `apps/worker/src/jobs/kb-crystallize.ts` | `packages/kb/src/lifecycle/crystallize.ts`, payload `crystallize-payload.ts`, API `kb-dispatch*.ts` |
| Workflow event `conversation/state.changed.closed` | Separate from KB event; KB uses **`keenai/conversation.closed`** |

## KB items — depth notes

| ID | Marked done | Gap / note |
|----|-------------|------------|
| KB-16 | [x] | **Improved (P3-13 pass):** Ingest now runs fetch→parse→clean→chunk→enrich→embed→index→notify through per-step handlers with duration metadata, failure capture, skipped dependent steps, and notify finalization. Source-specific connector handlers, retry policy, and external notification integrations remain future production wiring. |
| KB-18 | [x] | **Improved (P3-13 follow-up):** Markdown/HTML-ish parser normalizes headings, hierarchy, links, lists, and code blocks; hierarchical chunker splits on paragraph/sentence boundaries with overlap. Lightweight PDF/DOCX text extraction adapters now feed the same parser/chunker path; higher-fidelity production parsers remain future hardening. |
| KG-05 | [x] | `extractKbEntitiesFromDocument` heuristic; graph used in retrieval expand |
| KB-19 | [x] | **Improved (P3-13 pass):** Crystallize quality now scores CSAT, FAQ completeness, question specificity, entity coverage, extraction source, and weak-answer penalties; low-quality extracts stay `memory_only`, and KB-20 conflicts downgrade `auto_index` to candidate review. |
| KB-20 | [x] | **Improved (P3-13 pass):** Reconcile now combines topic overlap with policy signals (refund allowed/denied, refund windows, process channel conflicts) before writing supersession proposals. Full embedding/LLM contradiction judging remains future work. |
| KB-22 | [x] | **Improved (P3-13 pass):** `assembleUnifiedAgentContext` now injects KB hits when `kbSearch` is available, dedupes across KB/Memory, and dynamically reranks sections by intent, source weight, query overlap, and prior retrieval score. |
| KB-23 | [x] | Query-log metrics always on; recall/precision need **`includeGolden`** or `POST /kb/eval/run` |

## v0.2.0 pass notes (2026-07-08)

- **P3-10 fixed:** Qwen (`QWEN_API_KEY`) and Zhipu (`ZHIPU_API_KEY`) providers are wired through env parsing, API Copilot, Workflow "Let Keeni Answer", provider summaries, and prompt tests. Chinese conversations now add Simplified Chinese drafting guidance to the LLM system prompt.
- **P3-11 fixed:** Dashboard next-intl now registers 12 locale bundles (`en`, `zh`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `it`, `nl`, `ar`, `hi`) and the locale switcher renders from the shared supported-locale list.
- **P3-13 KB design parity fixed:** KB-16 ingest now has a real 8-stage runner with hookable handlers, API connector-index-notify wiring, source status/error updates, Inngest retries, config-backed file source ingestion, shallow web ingestion, GitHub raw content ingestion, and Notion page/block ingestion. KB-18 parser/chunker stubs were replaced with Markdown/HTML-ish normalization, PDF/DOCX text extraction adapters, and paragraph/sentence-boundary chunking with overlap. KB-19 now has explainable quality gates and conflict-aware candidate downgrade. KB-20 now uses policy-signal conflict detection in addition to topic overlap. KB-22 now performs dynamic KB/Memory reranking. `kb:design:report` records 26/26 KB design items done, 0 missing, 81/81 path checks, and 64/64 content probes. Remaining P3-13 release depth is production OAuth/webhook proof and production telemetry evidence.
- **P3-14 fixed:** `keenai import intercom --file` now imports users/admins and conversations/messages from normalized JSON or an extracted export directory into core tables. Direct ZIP extraction is intentionally not bundled; extract the archive first.
- **I119 typecheck hardening:** optional `@mastra/evals` scorer loading no longer breaks TypeScript when the optional package subpath is absent. Root `typecheck` now runs `corepack pnpm -r --if-present typecheck` so release checks use the repo-pinned pnpm version instead of nested Turbo subprocesses resolving a different pnpm.

## Non-KB doc mismatches

- **[11-RAG-KNOWLEDGE.md](./11-RAG-KNOWLEDGE.md)** — aligned to `@keenai/kb` + optional `@mastra/evals` judge.
- **[04-MODULES.md](./04-MODULES.md) / [06-TECH-STACK.md](./06-TECH-STACK.md)** — aligned: jobs via API `lib/*-inngest.ts` + domain packages (no `apps/worker`).
- **[03-ARCHITECTURE.md](./03-ARCHITECTURE.md) / [09-AGENT-ENGINE.md](./09-AGENT-ENGINE.md) / [10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md) / [13-WORKFLOW.md](./13-WORKFLOW.md) / [05-FRONTEND.md](./05-FRONTEND.md)** — `@mastra/rag` → `@keenai/kb`; worker paths → `packages/*/inngest` + `apps/api` (2026-05-19).
- **Sprint 16 UI bullets** in [08-ROADMAP.md](./08-ROADMAP.md) — superseded by CA-01～06 table; product UI items remain open.

## Doc hygiene (fixed)

- `08-ROADMAP-TODO.md`: KG-05 duplicate `[ ]` vs `[x]` aligned; CA-05/06 mid-doc table aligned with footer.
- `08-ROADMAP.md` Sprint 16: CA-01～06 checkboxes + note for remaining UI/MCP server expose.

## Release gates

See [GA.md](./GA.md): **0.1.0** shipped with relaxed dev gates; **v0.2.0** targets Recall@5 ≥ 88%, stale-answer proxy < 2% via `kb:release-gate`, CI green, documented KB bench P95.

## Recommended next work

跟踪 [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) **I104～I110**：

| ID | 项 | 状态 |
|----|-----|------|
| I104 | CSAT `rating` API + widget · crystallize 无隐式默认 CSAT | [x] |
| I105 | `keenai import zendesk --kb` 实写 `kb_documents` | [x] |
| I106 | close → `keenai/conversation.closed` 集成测试 | [x] |
| I107 | `MIGRATION.md` + `04-MODULES` / `06-TECH-STACK` 路径勘误 | [x] |
| I108 | KB-19 LLM FAQ extract（`KEENAI_CRYSTALLIZE_MODEL`） | [x] |
| I109 | Dashboard CA 向导 · Help Center KB search (`/custom-actions`, `/help-center`) | [x] |
| I110 | `CHANGELOG.md` · `deploy/helm/README.md` 规划 | [x] |
| I111 | GitHub Release **`v0.1.0`** | [x] |
| I112～I114 | hardening · Intercom import · Helm skeleton | [x] |
| I115～I120 | **v0.2.0** · Phase 0～3 全量 + Docker `0.2.0` | 待办（见 [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) § v0.2.0 发布门禁） |
