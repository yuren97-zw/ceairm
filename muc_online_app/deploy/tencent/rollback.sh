#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
SERVICE_NAME="${SERVICE_NAME:-airline-operations-center}"
HEALTH_CHECK="${HEALTH_CHECK:-$APP_ROOT/scripts/health-check.sh}"
TARGET="${1:-}"
CURRENT="$APP_ROOT/app/current"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/.env}"

if [[ -z "$TARGET" ]]; then
  TARGET="$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | sed -n '2s/^[^ ]* //p')"
fi
[[ -n "$TARGET" && -d "$TARGET" ]] || { echo "Rollback release not found" >&2; exit 1; }

VERSION="$(cat "$TARGET/.release-version")"
[[ "$VERSION" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "Invalid rollback release version" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Environment file not found" >&2; exit 1; }
if grep -q '^APP_VERSION=' "$ENV_FILE"; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$ENV_FILE"
else
  printf '\nAPP_VERSION=%s\n' "$VERSION" >> "$ENV_FILE"
fi
BUILD_SHA="${VERSION#production-}"
if [[ "$BUILD_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  if grep -q '^MUC_BUILD_SHA=' "$ENV_FILE"; then
    sed -i "s/^MUC_BUILD_SHA=.*/MUC_BUILD_SHA=$BUILD_SHA/" "$ENV_FILE"
  else
    printf '\nMUC_BUILD_SHA=%s\n' "$BUILD_SHA" >> "$ENV_FILE"
  fi
fi
ln -sfn "$TARGET" "$CURRENT"
systemctl restart "$SERVICE_NAME"
"$HEALTH_CHECK" "$VERSION"
echo "Rolled back to $TARGET"
