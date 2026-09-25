#!/bin/zsh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Users/zhaowei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "未找到 Node.js。请安装 Node 24+，或在 Codex 环境中运行。"
  exit 1
fi

cd "$APP_DIR"

if [[ "$APP_DIR" == *"/.codex/worktrees/"* ]]; then
  if lsof -nP -iTCP:8788 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "检测到Codex工作树8788服务已在运行。"
    echo "请直接访问：http://127.0.0.1:8788/"
    open "http://127.0.0.1:8788/" >/dev/null 2>&1 || true
    read -r "?按回车键关闭此窗口..."
    exit 0
  fi
  echo "启动Codex隔离工作树服务..."
  echo "端口：8788"
  echo "数据库：$APP_DIR/data/rbac-refactor-test.sqlite"
  echo "附件目录：$APP_DIR/uploads-rbac-test"
  exec "$NODE_BIN" scripts/start-worktree.mjs
fi

if lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "检测到 8787 端口已有服务在运行。"
  echo "请直接访问：http://127.0.0.1:8787/"
  open "http://127.0.0.1:8787/" >/dev/null 2>&1 || true
  echo ""
  echo "如需重启，请先关闭正在运行的服务窗口，或在终端中结束对应 node 进程。"
  read -r "?按回车键关闭此窗口..."
  exit 0
fi

echo "启动 MUC 本地测试服务..."
echo "访问地址：http://127.0.0.1:8787/"
echo "唯一超级账号：54002010 / muc2026（首次登录后请修改密码）"
echo ""
exec "$NODE_BIN" server.mjs
