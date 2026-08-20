#!/usr/bin/env bash
set -euo pipefail

EXPECTED_VERSION="${1:-}"
URL="${HEALTH_URL:-http://127.0.0.1:8787/api/health}"
BODY="$(curl --fail --silent --show-error --max-time 10 "$URL")"

node -e '
const body = JSON.parse(process.argv[1]);
const expected = process.argv[2];
if (!body.ok || body.status !== "ok" || body.database !== "postgres") process.exit(1);
if (expected && body.version !== expected) process.exit(2);
' "$BODY" "$EXPECTED_VERSION"

echo "$BODY"
