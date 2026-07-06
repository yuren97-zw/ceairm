#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
DB_PATH="${DB_PATH:-$APP_ROOT/data/muc.sqlite}"
UPLOAD_DIR="${UPLOAD_DIR:-$APP_ROOT/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/muc-$STAMP.sqlite'"
fi

if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
fi

find "$BACKUP_DIR" -type f \( -name "muc-*.sqlite" -o -name "uploads-*.tar.gz" \) -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete: $BACKUP_DIR"
