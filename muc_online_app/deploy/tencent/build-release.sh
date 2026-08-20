#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-$(node -p 'require(`./package.json`).version')-$(date +%Y%m%d%H%M%S)}"
OUTPUT="${2:-/tmp/airline-operations-center-$VERSION.tar.gz}"

FILES=(server.mjs db.mjs package.json public migrations scripts)
[[ -f package-lock.json ]] && FILES+=(package-lock.json)

tar -czf "$OUTPUT" \
  --exclude='.DS_Store' \
  --exclude='.env' \
  --exclude='.git' \
  --exclude='data' \
  --exclude='node_modules' \
  --exclude='outputs' \
  --exclude='uploads' \
  "${FILES[@]}"

sha256sum "$OUTPUT" > "$OUTPUT.sha256"
printf '%s\n' "$OUTPUT"
