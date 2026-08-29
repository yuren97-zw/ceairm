#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="/etc/nginx/sites-available/airline-operations-center"
BACKUP="${TARGET}.bak.$(date +%Y%m%d%H%M%S)"
[[ -f "$TARGET" ]] && cp "$TARGET" "$BACKUP"
install -m 0644 "$SCRIPT_DIR/nginx-airline-operations-center.conf" "$TARGET"
ln -sfn "$TARGET" /etc/nginx/sites-enabled/airline-operations-center
if ! nginx -t; then
  [[ -f "$BACKUP" ]] && cp "$BACKUP" "$TARGET"
  nginx -t
  echo "Nginx configuration rejected; previous configuration restored" >&2
  exit 1
fi
systemctl reload nginx
