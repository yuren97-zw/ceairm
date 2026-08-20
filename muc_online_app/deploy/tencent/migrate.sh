#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/.env}"
RELEASE_DIR="${1:-$APP_ROOT/app/current}"

set -a
source "$ENV_FILE"
set +a
cd "$RELEASE_DIR"
npm run migrate
