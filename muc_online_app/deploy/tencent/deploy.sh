#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ARCHIVE="${1:?Usage: deploy.sh RELEASE_ARCHIVE VERSION}"
VERSION="${2:?Usage: deploy.sh RELEASE_ARCHIVE VERSION}"
RELEASE_DIR="$APP_ROOT/releases/$VERSION"
CURRENT="$APP_ROOT/app/current"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"

[[ -f "$ARCHIVE" ]] || { echo "Release archive not found: $ARCHIVE" >&2; exit 1; }
[[ ! -e "$RELEASE_DIR" ]] || { echo "Release already exists: $RELEASE_DIR" >&2; exit 1; }

"$APP_ROOT/scripts/backup.sh"
mkdir -p "$RELEASE_DIR"
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
chown -R airline:airline "$RELEASE_DIR"

cd "$RELEASE_DIR"
npm install --omit=dev --no-audit --no-fund
APP_VERSION="$VERSION" "$APP_ROOT/scripts/migrate.sh" "$RELEASE_DIR"

ln -sfn "$RELEASE_DIR" "$CURRENT"
if grep -q '^APP_VERSION=' "$APP_ROOT/shared/.env"; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$APP_ROOT/shared/.env"
else
  printf '\nAPP_VERSION=%s\n' "$VERSION" >> "$APP_ROOT/shared/.env"
fi

systemctl restart airline-operations-center
if ! "$APP_ROOT/scripts/health-check.sh" "$VERSION"; then
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    systemctl restart airline-operations-center
  fi
  echo "Deployment failed; previous release restored" >&2
  exit 1
fi

echo "Deployed $VERSION"
