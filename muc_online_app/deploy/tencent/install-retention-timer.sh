#!/usr/bin/env bash
# 安装并启用数据保留清理定时器（D07：审计 3 年 / 考勤工时 5 年）。
# 前置：应用已部署（/opt/airline-operations-center/app/current 存在）、shared/.env 含 DATABASE_URL。
# 行为：安装 units → 创建归档目录 → 先干跑核对 → 启用月度 timer。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ARCHIVE_DIR="$APP_ROOT/archive/retention"
UNIT_DIR="/etc/systemd/system"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

install -m 0644 "$SCRIPT_DIR/airline-operations-center-retention.service" "$UNIT_DIR/"
install -m 0644 "$SCRIPT_DIR/airline-operations-center-retention.timer" "$UNIT_DIR/"
systemctl daemon-reload

install -d -o airline -g airline "$ARCHIVE_DIR"

echo "== 干跑核对（只统计，不写不删） =="
sudo -u airline bash -c "cd '$APP_ROOT/app/current' && set -a && . '$APP_ROOT/shared/.env' && set +a && /usr/bin/node scripts/retention-cleanup.mjs --archive-dir='$ARCHIVE_DIR'"

systemctl enable --now airline-operations-center-retention.timer
systemctl list-timers airline-operations-center-retention.timer --no-pager
echo "已启用：每月 1 日 03:30（Persistent）执行归档+清理；日志 $APP_ROOT/../log/airline-operations-center/retention.log（实际为 /var/log/airline-operations-center/retention.log）"
