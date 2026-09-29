#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(node -p 'require(`./package.json`).version')-$(date +%Y%m%d%H%M%S)}"
OUTPUT="${2:-/tmp/airline-operations-center-$VERSION.tar.gz}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp server.mjs db.mjs postgres-connection.mjs login-protection.mjs authorization-import.mjs authorization-projects.mjs capability-core.mjs capability-integrity.mjs capability-service.mjs import-workspace.mjs organization-lanes.mjs personnel-access.mjs personnel-deletion.mjs personnel-identity.mjs rbac-policy.mjs package.json package-lock.json "$STAGE/"
cp -R migrations scripts "$STAGE/"
npm run build:capability
RELEASE_VERSION="$VERSION" node scripts/build-web-assets.mjs "$STAGE/public"
printf '%s\n' "$VERSION" > "$STAGE/.release-version"

(
  cd "$STAGE"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)

tar -czf "$OUTPUT" -C "$STAGE" .

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$(dirname "$OUTPUT")" && sha256sum "$(basename "$OUTPUT")" > "$(basename "$OUTPUT").sha256")
else
  (cd "$(dirname "$OUTPUT")" && shasum -a 256 "$(basename "$OUTPUT")" > "$(basename "$OUTPUT").sha256")
fi
printf '%s\n' "$OUTPUT"
