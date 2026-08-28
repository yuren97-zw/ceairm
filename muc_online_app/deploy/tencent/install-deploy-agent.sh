#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ENV_FILE="${DEPLOY_AGENT_ENV:-/etc/airline-operations-center-deploy.env}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 0750 "$APP_ROOT/scripts"
for script in \
  deploy.sh \
  health-check.sh \
  migrate.sh \
  release-poller.sh \
  rollback.sh; do
  install -m 0750 "$SCRIPT_DIR/$script" "$APP_ROOT/scripts/$script"
done
install -m 0750 "$SCRIPT_DIR/backup-airline-operations-center.sh" "$APP_ROOT/scripts/backup.sh"
install -d -m 0755 "$SYSTEMD_DIR"
install -m 0644 "$SCRIPT_DIR/airline-operations-center-deploy.service" "$SYSTEMD_DIR/airline-operations-center-deploy.service"
install -m 0644 "$SCRIPT_DIR/airline-operations-center-deploy.timer" "$SYSTEMD_DIR/airline-operations-center-deploy.timer"

if [[ ! -f "$ENV_FILE" ]]; then
  install -m 0600 /dev/null "$ENV_FILE"
  cat >> "$ENV_FILE" <<'EOF'
GITHUB_REPOSITORY=yuren97-zw/ceairm
GITHUB_TOKEN=replace-with-fine-grained-contents-read-token
EOF
fi

systemctl daemon-reload
repository="$(sed -n 's/^GITHUB_REPOSITORY=//p' "$ENV_FILE" | tail -1)"
token="$(sed -n 's/^GITHUB_TOKEN=//p' "$ENV_FILE" | tail -1)"
if [[ -z "$repository" || -z "$token" || "$token" == replace-with-* ]]; then
  systemctl disable --now airline-operations-center-deploy.timer >/dev/null 2>&1 || true
  echo "Deployment agent files installed, but the timer remains disabled." >&2
  echo "Set a fine-grained GitHub token with repository Contents: read in $ENV_FILE, then run this installer again." >&2
  exit 0
fi

systemctl enable --now airline-operations-center-deploy.timer
systemctl list-timers airline-operations-center-deploy.timer --no-pager
