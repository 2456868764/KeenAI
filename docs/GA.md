# KeenAI Release Checklists

> **0.1.0** shipped (`v0.1.0` · prerelease). **Next target: `v0.2.0`** — see [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) I115～I117.  
> Design gaps: [DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md).

## 0.1.0 (shipped)

- [x] KB Phase A–C (KB-07～24) — see audit for stub/partial items
- [x] P0 wiring: `keenai/conversation.closed` · crystallize `auto_index` · `includeGolden` metrics
- [x] CSAT · Zendesk HC import · close integration tests
- [x] `CHANGELOG.md` + [releases/v0.1.0.md](./releases/v0.1.0.md)
- [x] `git tag v0.1.0` + GitHub Release (prerelease)
- [x] I112～I114: hardening · Intercom import · Helm skeleton

## v0.2.0 (planned · I115～I117)

### I115 · Quality gates

- [ ] Recall@5 ≥ **88%** on dev golden set (`pnpm kb:eval`)
- [ ] `pnpm test` + CI green on `main`
- [ ] KB P95 documented (`pnpm kb:bench` · `kb-perf.yaml`)

### I116 · Docker

- [ ] GHCR publish pipeline · images tagged **`0.2.0`**

### I117 · Release

- [ ] `CHANGELOG [0.2.0]` · `docs/releases/v0.2.0.md`
- [ ] `git tag v0.2.0` · GitHub Release (prerelease)
