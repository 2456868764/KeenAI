# Beta acceptance (v0.2.0 · Phase 2)

Checklist for I117 Phase 2 Beta gate. Run after `pnpm test` and `pnpm alpha:acceptance`.

## Automated

| Check | Command | Expected |
|-------|---------|----------|
| Unit + integration tests | `pnpm test` | All green |
| Ticket types (3 kinds) | `tickets.integration.test.ts` | customer / back_office / tracker |
| Tracker fan-out | same | Child tickets sync on tracker status |
| Field DSL | `packages/shared` ticket-field tests | Validation passes |
| Workflow wait/http/branches | `packages/workflow` executor tests | Blocks execute + branch jumps |
| Workflow convert_to_ticket | `executor.test.ts` | Returns ticketId |
| Workflow publish snapshot | `workflows` route + migration 0032 | `publishedDefinition` set on publish |
| Public KB articles | `kb-public.integration.test.ts` | Collections + articles list |
| Discord inbound | `im.integration.test.ts` | 202 accepted |
| Discord outbound | `outbound.discord.test.ts` | Plan includes discord channel |
| Alpha smoke | `pnpm alpha:acceptance` | Pass |

## Manual (P2-ACC)

- [ ] **P2-ACC-01** Featurebase ~60% parity (tickets, feedback board, HC — spot-check)
- [ ] **P2-ACC-02** ≥3 external teams on Beta build
- [ ] **P2-ACC-03** Vitest + Playwright e2e coverage ≥65% (track in CI dashboard)

## Product smoke

1. Dashboard → Tickets: three types visible; create + link tracker → child sync on Done.
2. Dashboard → Workflows: add Branches / Convert to ticket / Wait / HTTP; publish; verify Recent runs.
3. Dashboard → Settings → Brands: create second brand slug.
4. Portal: magic link → ticket list → ticket detail page.
5. Webhook: `POST /api/v1/webhooks/im/discord?org={slug}` with MESSAGE_CREATE payload.

## Batch 2 smoke (I117 continued)

1. Dashboard → Feedback: submit idea, see upvotes.
2. Dashboard → Analytics: ticket / feedback / HC search counts.
3. `POST /api/v1/sla/policies` + `PUT /api/v1/sla/office-hours`.
4. `GET /api/v1/public/{org}/feedback/ideas/posts` (PORTAL_PUBLIC_READ).
5. `GET /api/v1/public/{org}/kb/search?brandId=…&q=…` (public HC search).
6. Ticket status change emails customer when SMTP + customerId set.

## Batch 3 smoke (I117 continued)

1. Workflow with `branches` on `channelType` → correct next block in run trace.
2. Workflow `convert_to_ticket` → ticket appears in Dashboard + Portal.
3. Portal `/help` lists public articles; article page has `<title>` / meta from `generateMetadata`.
4. `GET /api/v1/public/{org}/kb/collections` and `…/kb/articles/{id}`.
5. Discord outbound: agent reply posts to channel after inbound webhook.

## Still open (Phase 2 remainder)

Full ECharts dashboards, React Email components, Tiptap HC editor, workflow builder layers — `08-ROADMAP-TODO.md` §P2.
