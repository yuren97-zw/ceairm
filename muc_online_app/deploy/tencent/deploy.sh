#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ARCHIVE="${1:?Usage: deploy.sh RELEASE_ARCHIVE VERSION}"
VERSION="${2:?Usage: deploy.sh RELEASE_ARCHIVE VERSION}"
RELEASE_DIR="$APP_ROOT/releases/$VERSION"
STAGE_DIR="$APP_ROOT/releases/.${VERSION}.staging.$$"
CURRENT="$APP_ROOT/app/current"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"
cleanup() { [[ ! -d "$STAGE_DIR" ]] || rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

[[ -f "$ARCHIVE" ]] || { echo "Release archive not found: $ARCHIVE" >&2; exit 1; }
[[ -f "$ARCHIVE.sha256" ]] || { echo "Release checksum not found: $ARCHIVE.sha256" >&2; exit 1; }
(cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")

"$APP_ROOT/scripts/backup.sh"
if [[ ! -d "$RELEASE_DIR" ]]; then
  mkdir -p "$STAGE_DIR"
  tar -xzf "$ARCHIVE" -C "$STAGE_DIR"
  chown -R airline:airline "$STAGE_DIR"
  [[ -d "$STAGE_DIR/node_modules" ]] || { echo "Release does not contain tested production dependencies" >&2; exit 1; }
  [[ "$(cat "$STAGE_DIR/.release-version" 2>/dev/null || true)" == "$VERSION" ]] || { echo "Release version does not match deployment version" >&2; exit 1; }
  APP_VERSION="$VERSION" "$APP_ROOT/scripts/migrate.sh" "$STAGE_DIR"
  mv "$STAGE_DIR" "$RELEASE_DIR"
else
  [[ -d "$RELEASE_DIR/node_modules" && "$(cat "$RELEASE_DIR/.release-version" 2>/dev/null || true)" == "$VERSION" ]] || {
    echo "Existing release is incomplete or has the wrong version: $RELEASE_DIR" >&2
    exit 1
  }
fi

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
