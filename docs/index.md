# KeenAI Documentation

> Documentation hub (Sprint 18 · I103). Product is in **Alpha** — see [ALPHA.md](./ALPHA.md).

## Get started

| Doc | Description |
|-----|-------------|
| [README](../README.md) | Vision, stack, monorepo layout |
| [ALPHA.md](./ALPHA.md) | Alpha scope, quick start, Docker lite |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production profiles, env, `kb:bench` / `kb:eval` |
| [MIGRATION.md](./MIGRATION.md) | Intercom / Zendesk import (`keenai import`) |
| [GA.md](./GA.md) | 1.0 release checklist |
| [DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md) | Design vs code gaps (pre-GA) |

## Product & architecture

| Doc | Contents |
|-----|----------|
| [01-PRD.md](./01-PRD.md) | Product requirements |
| [02-FEATURES.md](./02-FEATURES.md) | Feature matrix vs Featurebase |
| [03-ARCHITECTURE.md](./03-ARCHITECTURE.md) | System architecture |
| [04-MODULES.md](./04-MODULES.md) | Module design |
| [05-FRONTEND.md](./05-FRONTEND.md) | Dashboard & widget |
| [06-TECH-STACK.md](./06-TECH-STACK.md) | Technology choices |
| [07-DATA-MODEL.md](./07-DATA-MODEL.md) | Database schema |
| [08-ROADMAP.md](./08-ROADMAP.md) | Phased roadmap |
| [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) | Iteration tracker |

## AI core

| Doc | Contents |
|-----|----------|
| [09-AGENT-ENGINE.md](./09-AGENT-ENGINE.md) | Keeni Agent runtime |
| [10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md) | Memory layers |
| [11-RAG-KNOWLEDGE.md](./11-RAG-KNOWLEDGE.md) | KB / RAG design |
| [11-RAG-OPTIMIZATION.md](./11-RAG-OPTIMIZATION.md) | KB-07～24 optimization track |
| [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) | Memory Tree pipeline |

## Platform

| Doc | Contents |
|-----|----------|
| [12-STORAGE-ABSTRACTION.md](./12-STORAGE-ABSTRACTION.md) | Store / vector / FTS |
| [13-WORKFLOW.md](./13-WORKFLOW.md) | Workflows + Inngest |
| [14-MULTIMODAL.md](./14-MULTIMODAL.md) | Multimodal messages |

## CLI & eval

```bash
pnpm keenai import intercom --file ./export.zip --org-slug demo --dry-run
pnpm keenai memory export --vault --org-id <org> --brand-id <brand>
pnpm kb:eval    # golden retrieval suite
pnpm kb:bench   # search load test (API must be running)
```

Set `KEENAI_EVAL_JUDGE_MODEL=openai/gpt-4o-mini` (and provider API keys) to enable Mastra faithfulness scoring in KB eval.
