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
| Workflow graph layout | `workflow-graph.test.ts` | Branch + outcome edges |
| Help center CRUD + publish | `help-center.integration.test.ts` | KB doc synced |
| Analytics dashboard | `analytics.integration.test.ts` | 14-day series + breakdowns |
| Multimodal upload + list | `multimodal.integration.test.ts` | photo message + content proxy |
| Copilot vision context | `copilot.integration.test.ts` | image in draft request |
| Email attachment ingest | `email-webhook.integration.test.ts` | MIME → photo message |
| Workflow send_message attachments | `workflow.integration.test.ts` | attachmentIds on outbound |
| Tiptap attachment extract | `tiptap-attachments.test.ts` | image node IDs |
| Help Center sitemap + JSON-LD | `help-center-seo.test.ts` | sitemap entries + schema.org |
| Public HC from help_articles | `kb-public.integration.test.ts` | SEO fields on detail |
| Alpha smoke | `pnpm alpha:acceptance` | Pass |

## Manual (P2-ACC)

- [ ] **P2-ACC-01** Featurebase ~60% parity (tickets, feedback board, HC — spot-check)
- [ ] **P2-ACC-02** ≥3 external teams on Beta build
- [ ] **P2-ACC-03** Vitest + Playwright e2e coverage ≥65% (track in CI dashboard)

## Product smoke

1. Dashboard → Tickets: three types visible; create + link tracker → child sync on Done.
2. Dashboard → Workflows (Flow view): dagre layout, branch edges, click block → Sheet config; publish.
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

## Batch 8 smoke (I117 continued)

1. Portal `/help` SSR lists published articles (ISR 60s).
2. `GET /sitemap.xml` includes `/help` and `/help/{articleId}` URLs.
3. Article page has JSON-LD + `opengraph-image` (1200×630 PNG).
4. `robots.txt` references sitemap URL.

## Batch 7 smoke (I117 continued)

1. Dashboard Inbox: paste/drag image → send with `attachmentIds`; bubble shows image.
2. Widget: attach image → customer message appears as photo in Inbox.
3. Email inbound with PNG attachment → conversation message `messageKind: photo`.
4. Copilot draft on image thread includes vision context (non-stub providers).

## Batch 6 smoke (I117 continued)

1. Dashboard → Analytics: Support/Feedback/HC sections with ECharts pie, bar, line charts.
2. `GET /api/v1/analytics/dashboard` returns `createdDaily` (14 points) and status breakdowns.

## Batch 5 smoke (I117 continued)

1. Dashboard → Help Center: create collection, new article, Tiptap edit, Publish.
2. Public portal `/help` shows published article; article page uses `seoTitle` / `seoDescription`.
3. KB search returns indexed content after publish.

## Batch 4 smoke (I117 continued)

1. Flow canvas: trigger node + dagre layout; purple labeled branch/outcome edges.
2. Click block → right Sheet opens with full config (branch targets as dropdowns).
3. `let_keeni_answer` outcome routing: Resolved / Unresolved / Escalated paths on canvas.

## Still open (Phase 2 remainder)

React Email components, Tiptap HC extensions (callout/steps), Playwright e2e — `08-ROADMAP-TODO.md` §P2.
