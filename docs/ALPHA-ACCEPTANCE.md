# Alpha Acceptance (Phase 1 · P1-12)

> Runnable checklist for **v0.2.0 Phase 1** before public Alpha.  
> Automate: `pnpm alpha:acceptance`

## Automated gates

| Check | Command |
|-------|---------|
| Toolchains + layout | `pnpm verify:p0` |
| Lint | `pnpm lint` |
| DB migrate | `pnpm db:migrate` |
| API smoke (in-process) | `ci-smoke.integration.test.ts` |
| Email IMAP + outbound | `email-imap` / `email-outbound` integration tests |
| Workflow triggers | `workflow.integration.test.ts` |
| KB golden eval | `pnpm kb:eval` |
| API binary (optional CI) | `pnpm verify:api-binary` |
| Internal support flow | `pnpm support:flow:report` |
| Customer reachability | `pnpm customer:reachability:report` |
| Copilot adoption report | `pnpm copilot:adoption:report --fixture` in CI; omit fixture against production/prod-like `copilot_events` |
| Docker lite startup report | `DOCKER_LITE_STARTUP_DRY_RUN=true pnpm docker:lite:startup-report` in CI; omit dry-run in a Docker-enabled release environment |
| Quality gate report | `pnpm test:coverage && pnpm quality:gate:report` |

## Manual gates (P1-ACC)

| ID | Criterion | How to verify |
|----|-----------|---------------|
| P1-ACC-01 | Internal support end-to-end | `pnpm support:flow:report` plus running-environment dogfood evidence |
| P1-ACC-02 | Widget + Email reachability | `pnpm customer:reachability:report` plus running-environment widget embed and SMTP/IMAP or webhook ingest evidence |
| P1-ACC-03 | Copilot adoption ≥ 30% | `pnpm copilot:adoption:report` against production/prod-like `copilot_events` |
| P1-ACC-04 | Docker lite < 30s | `pnpm docker:lite:startup-report` in a Docker-enabled release environment |
| P1-ACC-05 | Local bootstrap < 2min | `pnpm bootstrap:local` after `pnpm install` |
| P1-ACC-06 | Tests + CI green | `pnpm test:coverage && pnpm quality:gate:report` plus GitHub Actions history proving ≥95% green rate |

## Docker lite (single container)

```bash
docker compose --profile lite up --build -d
# Dashboard http://localhost:3000 · API http://localhost:8090
# Demo: owner@keenai.local / keenai-demo-12
```

Split API + Dashboard (legacy two-container):

```bash
docker compose --profile split up --build -d
```

## Community launch (P1-12)

- [ ] `docs/ALPHA.md` + `/quickstart` up to date
- [ ] `CONTRIBUTING.md` linked from README
- [ ] GitHub Release notes draft (`docs/releases/v0.2.0.md`)
- [ ] Product Hunt / HN — post when v0.2.0 tag ships (optional for Alpha)
