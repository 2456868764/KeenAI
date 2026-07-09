# Video Script: KB Import, Eval, And Bench

## Metadata

- YouTube title: KeenAI v0.2.0 KB Import, Eval, and Bench Gates
- Bilibili title: KeenAI v0.2.0 知识库导入、评测与压测门禁
- Target length: 5-7 min
- Audience: support engineering teams validating KB quality before release

## Key commands

```bash
corepack pnpm keenai import intercom --file ./export.json --org-slug demo --dry-run
CI=true corepack pnpm kb:release-gate
CI=true corepack pnpm kb:eval
CI=true corepack pnpm kb:bench:local
```

## Shot list

| Time | Visual | Narration |
|------|--------|-----------|
| 00:00 | `docs/MIGRATION.md` | v0.2.0 supports Intercom normalized export import for users, conversations, and messages. |
| 00:45 | Dry-run import command | Run import in dry-run mode first to validate structure without writing data. |
| 01:45 | `packages/kb/config/kb-eval.yaml` | Explain Recall@5 and stale-answer thresholds. |
| 02:30 | `kb:release-gate` | Run the focused release gate for Recall@5 and stale-answer proxy. |
| 03:30 | `kb:eval` | Run the broader golden retrieval suite. |
| 04:30 | `kb:bench:local` | Run local KB sync/index/search P95 validation without requiring a Bun API server. |
| 05:30 | `docs/V0.2.0-RELEASE-GAP-AUDIT.md` | Explain which evidence is local and which evidence still requires production or CI artifacts. |

## Voiceover

This video covers the KB quality gates for KeenAI v0.2.0.

Start with an Intercom import dry run. The importer can validate normalized exports before any data is written.

Next run the focused KB release gate. It checks Recall@5 and stale-answer proxy thresholds from the v0.2.0 eval config.

Then run the broader KB eval suite. This exercises golden retrieval, Mastra judge fallback behavior, and release gate wiring.

Finally run the local KB bench. It syncs fixture documents, indexes chunks, runs concurrent KB searches, and checks P95 latency against `kb-perf.yaml`.

These local checks are necessary but not sufficient. Final release still needs production telemetry, remote CI history, and API-level `kb:bench` output from a running service.

## Captions

- `00:00` Import validates migration inputs.
- `02:30` `kb:release-gate` checks Recall@5 and stale-answer proxy.
- `03:30` `kb:eval` runs the broader golden retrieval suite.
- `04:30` `kb:bench:local` captures local P95 evidence.
- `05:30` Production telemetry remains a release gate.
