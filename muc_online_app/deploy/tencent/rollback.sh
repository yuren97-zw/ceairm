#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
TARGET="${1:-}"
CURRENT="$APP_ROOT/app/current"

if [[ -z "$TARGET" ]]; then
  TARGET="$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | sed -n '2s/^[^ ]* //p')"
fi
[[ -n "$TARGET" && -d "$TARGET" ]] || { echo "Rollback release not found" >&2; exit 1; }

ln -sfn "$TARGET" "$CURRENT"
systemctl restart airline-operations-center
"$APP_ROOT/scripts/health-check.sh"
echo "Rolled back to $TARGET"
