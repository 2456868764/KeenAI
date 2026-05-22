#!/usr/bin/env bash
# Build a standalone KeenAI API binary with Bun.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/keenai-api}"

mkdir -p "$(dirname "$OUT")"

echo "Building API binary → $OUT"
cd "$ROOT/apps/api"
bun build src/index.ts --compile --outfile "$OUT"

echo "Done. Run: $OUT  (requires DATABASE_URL, JWT_SECRET, etc.)"
