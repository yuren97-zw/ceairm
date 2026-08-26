#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 0750 "$APP_ROOT/scripts"
install -m 0750 "$SCRIPT_DIR/release-poller.sh" "$APP_ROOT/scripts/release-poller.sh"
install -m 0644 "$SCRIPT_DIR/airline-operations-center-deploy.service" /etc/systemd/system/airline-operations-center-deploy.service
install -m 0644 "$SCRIPT_DIR/airline-operations-center-deploy.timer" /etc/systemd/system/airline-operations-center-deploy.timer

if [[ ! -f /etc/airline-operations-center-deploy.env ]]; then
  install -m 0600 /dev/null /etc/airline-operations-center-deploy.env
  cat >> /etc/airline-operations-center-deploy.env <<'EOF'
GITHUB_REPOSITORY=yuren97-zw/ceairm
GITHUB_TOKEN=replace-with-fine-grained-contents-read-token
EOF
  echo "Edit /etc/airline-operations-center-deploy.env before enabling the timer." >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable --now airline-operations-center-deploy.timer
systemctl list-timers airline-operations-center-deploy.timer --no-pager
