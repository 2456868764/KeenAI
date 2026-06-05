#!/usr/bin/env bash
# P1-10: build and smoke-test the compiled API binary.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${KEENAI_API_BINARY:-$ROOT/dist/keenai-api}"
PORT="${KEENAI_BINARY_PORT:-18990}"

bash "$ROOT/scripts/build-api-binary.sh" "$OUT"

if [[ ! -x "$OUT" ]]; then
  echo "binary not executable: $OUT" >&2
  exit 1
fi

echo "binary compile ok: $OUT"

# Runtime smoke runs on Linux CI (libsql native embed). macOS compile-only.
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "runtime smoke skipped on $(uname -s) — verified in CI on ubuntu-latest"
  exit 0
fi

export DATABASE_URL=":memory:"
export JWT_SECRET="dev-only-change-me-in-production-keenai-32"
export NODE_ENV=production
export PORT="$PORT"
export LOG_FORMAT=json

"$OUT" &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    echo "binary health ok on :${PORT}"
    exit 0
  fi
  sleep 1
done

echo "binary failed to respond on /health" >&2
exit 1
