# Contributing to KeenAI

Thank you for your interest in contributing.

## Development setup

1. Install [Node.js](https://nodejs.org/) 20+, [pnpm](https://pnpm.io/) 9+, and [Bun](https://bun.sh/) (API runtime).
2. Clone the repo and run `pnpm install`.
3. Copy `.env.example` to `.env` and run `pnpm db:migrate && pnpm seed`.
4. Start the stack with `pnpm dev` (API on port 8090, dashboard on 3000).

Git hooks are installed automatically on `pnpm install`. The pre-commit hook runs `pnpm lint` before each commit. To reinstall manually:

```bash
node scripts/install-githooks.mjs
```

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm lint` | Biome lint + format check |
| `pnpm test` | Vitest across packages |
| `pnpm build` | Build all packages |
| `pnpm db:migrate` | Apply LibSQL migrations |

## Pull requests

- Keep changes focused; one logical change per PR when possible.
- Run `pnpm lint` and `pnpm test` before opening a PR.
- Follow existing code style (Biome, TypeScript strict mode).
- Update `docs/` when behavior or APIs change.

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license in `LICENSE`.
