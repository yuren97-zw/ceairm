#!/usr/bin/env bash
set -euo pipefail

EXPECTED_VERSION="${1:-}"
URL="${HEALTH_URL:-http://127.0.0.1:8787/api/health}"
ATTEMPTS="${HEALTH_ATTEMPTS:-30}"
INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-2}"
BODY=""

for ((attempt = 1; attempt <= ATTEMPTS; attempt++)); do
  BODY="$(curl --fail --silent --show-error --connect-timeout 2 --max-time 5 "$URL" 2>/dev/null || true)"
  if node -e '
const body = JSON.parse(process.argv[1]);
const expected = process.argv[2];
if (!body.ok || body.status !== "ok" || body.database !== "postgres") process.exit(1);
if (expected && body.version !== expected) process.exit(2);
' "$BODY" "$EXPECTED_VERSION" 2>/dev/null; then
    echo "$BODY"
    exit 0
  fi

  (( attempt == ATTEMPTS )) || sleep "$INTERVAL_SECONDS"
done

echo "Health check did not become ready after $ATTEMPTS attempts: $URL" >&2
[[ -z "$BODY" ]] || echo "$BODY" >&2
exit 1
