# KeenAI 0.1.0 Release Checklist

> Target tag: **`v0.1.0`** (semver minor after Alpha `0.0.1`). Full **1.0 GA** remains a later milestone — see [08-ROADMAP.md](./08-ROADMAP.md).  
> Design vs implementation gaps: [DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md).

## Engineering (0.1.0 scope)

- [x] KB Phase A–C (KB-07～24) — see audit for stub/partial items
- [x] P0 wiring: `keenai/conversation.closed` on close · crystallize `auto_index` FTS · `GET /kb/eval/metrics?includeGolden=true`
- [x] CSAT rating API + Zendesk HC import (`I104`–`I105`)
- [x] KB-19 LLM FAQ extract (`KEENAI_CRYSTALLIZE_MODEL` + `OPENAI_API_KEY`, `I108`)
- [x] Golden eval suite + nightly CI (`pnpm kb:eval`)
- [x] KB search bench (`pnpm kb:bench`)
- [x] Deployment guide ([DEPLOYMENT.md](./DEPLOYMENT.md))
- [x] Dashboard CA wizard stub + Help Center KB search (`I109`)
- [x] `CHANGELOG.md` + [releases/v0.1.0.md](./releases/v0.1.0.md)
- [~] `keenai import`（Zendesk HC 实写 · Intercom stub）
- [~] Mastra eval judge · public docs site · Helm chart

## Quality gates (recommended before tag)

- [ ] Recall@5 ≥ 88% on dev golden set (`pnpm kb:eval`) — 92% reserved for 1.0
- [ ] `pnpm test` green on `main`
- [ ] `pnpm kb:bench` P95 documented (see `packages/kb/config/kb-perf.yaml`)

## Release steps

- [ ] Security smoke review (JWT, uploads, widget HMAC)
- [x] CHANGELOG [0.1.0]
- [ ] GitHub release **`v0.1.0`** (prerelease ok)
- [ ] Docker images tagged **`0.1.0`** (when publish pipeline exists)
- [ ] Disable `KEENAI_AUTO_SEED` in production compose

## After 0.1.0

- 1.0 GA: Intercom import, Helm chart, Help Portal, measured quality gates — [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) I111+
