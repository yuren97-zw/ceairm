#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/postgres-$STAMP.dump"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a
: "${DATABASE_URL:?DATABASE_URL is required}"

mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --no-privileges --file="$BACKUP_FILE" "$DATABASE_URL"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"

if [[ -n "${COS_BACKUP_URI:-}" ]]; then
  command -v coscli >/dev/null || { echo "coscli is required for offsite backup" >&2; exit 1; }
  coscli cp "$BACKUP_FILE" "${COS_BACKUP_URI%/}/$(basename "$BACKUP_FILE")"
  coscli cp "$BACKUP_FILE.sha256" "${COS_BACKUP_URI%/}/$(basename "$BACKUP_FILE.sha256")"
fi

echo "$BACKUP_FILE"
