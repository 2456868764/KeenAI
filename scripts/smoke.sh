#!/usr/bin/env bash
# KeenAI API smoke test — run while `pnpm dev` is up.
# Usage:
#   pnpm smoke
#   BASE_URL=http://127.0.0.1:8090 pnpm smoke
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... SMOKE_ORG_SLUG=demo pnpm smoke
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8090}"
EMAIL="${SMOKE_EMAIL:-owner@keenai.local}"
PASSWORD="${SMOKE_PASSWORD:-keenai-demo-12}"
ORG_SLUG="${SMOKE_ORG_SLUG:-demo}"

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

fail() {
  echo -e "${RED}✗${NC} $1" >&2
  exit 1
}

ok() {
  echo -e "${GREEN}✓${NC} $1"
}

json_get() {
  local key="$1"
  local body="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$body" | jq -r ".$key // empty"
    return
  fi
  echo "$body" | sed -n "s/.*\"${key}\":\"\\([^\"]*\\)\".*/\\1/p" | head -n1
}

http_code() {
  curl -sS -o "$1" -w "%{http_code}" "${@:2}"
}

echo -e "${DIM}KeenAI smoke → ${BASE_URL}${NC}"

# 1. Liveness
code="$(http_code /dev/stdout "${BASE_URL}/health")" || fail "Cannot reach ${BASE_URL} — start API with: pnpm dev"
[[ "$code" == "200" ]] || fail "GET /health returned HTTP ${code}"

code="$(http_code /dev/stdout "${BASE_URL}/api/v1/health")" || fail "GET /api/v1/health failed"
[[ "$code" == "200" ]] || fail "GET /api/v1/health returned HTTP ${code} (DB down? run: pnpm db:migrate && pnpm seed)"

ok "GET /health"
ok "GET /api/v1/health"

# 2. Login (requires seed data)
login_body="$(mktemp)"
trap 'rm -f "$login_body" "$me_body"' EXIT
me_body="$(mktemp)"

code="$(http_code "$login_body" -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"orgSlug\":\"${ORG_SLUG}\"}")"

if [[ "$code" != "200" ]]; then
  echo -e "${DIM}Response:${NC} $(cat "$login_body")" >&2
  fail "POST /api/v1/auth/login returned HTTP ${code} (run: pnpm seed ?)"
fi

access_token="$(json_get accessToken "$(cat "$login_body")")"
[[ -n "$access_token" ]] || fail "login response missing accessToken"

role="$(json_get role "$(cat "$login_body")")"
ok "POST /api/v1/auth/login (${EMAIL}, role=${role:-?})"

# 3. Current user
code="$(http_code "$me_body" -H "Authorization: Bearer ${access_token}" \
  "${BASE_URL}/api/v1/me")"
[[ "$code" == "200" ]] || fail "GET /api/v1/me returned HTTP ${code}"

if command -v jq >/dev/null 2>&1; then
  me_email="$(jq -r '.account.email // empty' <"$me_body")"
  ok "GET /api/v1/me (account=${me_email})"
else
  ok "GET /api/v1/me"
fi

# 4. RBAC probe
rbac_code="$(http_code /dev/stdout -H "Authorization: Bearer ${access_token}" \
  "${BASE_URL}/api/v1/rbac/check?resource=conversation&action=read")"
[[ "$rbac_code" == "200" ]] || fail "GET /api/v1/rbac/check returned HTTP ${rbac_code}"

ok "GET /api/v1/rbac/check"

# 5. Conversations inbox
conv_body="$(mktemp)"
trap 'rm -f "$login_body" "$me_body" "$conv_body"' EXIT

code="$(http_code "$conv_body" -H "Authorization: Bearer ${access_token}" \
  "${BASE_URL}/api/v1/conversations")"
[[ "$code" == "200" ]] || fail "GET /api/v1/conversations returned HTTP ${code}"

if command -v jq >/dev/null 2>&1; then
  conv_count="$(jq '.items | length' <"$conv_body")"
  ok "GET /api/v1/conversations (${conv_count} items)"
else
  ok "GET /api/v1/conversations"
fi

echo -e "${GREEN}Smoke passed.${NC}"
