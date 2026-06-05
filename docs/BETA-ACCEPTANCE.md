# Beta acceptance (v0.2.0 · Phase 2)

Checklist for I117 Phase 2 Beta gate. Run after `pnpm test` and `pnpm alpha:acceptance`.

## Automated

| Check | Command | Expected |
|-------|---------|----------|
| Unit + integration tests | `pnpm test` | All green |
| Ticket types (3 kinds) | `tickets.integration.test.ts` | customer / back_office / tracker |
| Tracker fan-out | same | Child tickets sync on tracker status |
| Field DSL | `packages/shared` ticket-field tests | Validation passes |
| Workflow wait/http | `packages/workflow` executor tests | Blocks execute |
| Discord inbound | `im.integration.test.ts` | 202 accepted |
| Alpha smoke | `pnpm alpha:acceptance` | Pass |

## Manual (P2-ACC)

- [ ] **P2-ACC-01** Featurebase ~60% parity (tickets, feedback board, HC — spot-check)
- [ ] **P2-ACC-02** ≥3 external teams on Beta build
- [ ] **P2-ACC-03** Vitest + Playwright e2e coverage ≥65% (track in CI dashboard)

## Product smoke

1. Dashboard → Tickets: three types visible; create + link tracker → child sync on Done.
2. Dashboard → Workflows: add Wait / HTTP blocks; publish; verify Recent runs after trigger.
3. Dashboard → Settings → Brands: create second brand slug.
4. Portal: magic link → ticket list → ticket detail page.
5. Webhook: `POST /api/v1/webhooks/im/discord?org={slug}` with MESSAGE_CREATE payload.

## Not in this batch (Phase 2 remainder)

SLA, Feedback board, public HC SSR, analytics ECharts, email React templates, workflow branches UI — tracked in `08-ROADMAP-TODO.md` §P2.
