#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
APP_USER="${APP_USER:-airline}"
: "${POSTGRES_APP_PASSWORD:?Set POSTGRES_APP_PASSWORD before running bootstrap.sh}"

apt-get update
apt-get install -y ca-certificates curl gnupg nginx postgresql postgresql-contrib certbot python3-certbot-nginx logrotate

if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 24 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 \
  "$APP_ROOT/app" "$APP_ROOT/releases" "$APP_ROOT/shared" "$APP_ROOT/scripts" \
  "$APP_ROOT/backups" "$APP_ROOT/logs" /var/log/airline-operations-center

sudo -u postgres psql --set ON_ERROR_STOP=1 --set app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'airline') THEN
    CREATE ROLE airline LOGIN;
  END IF;
END
$do$;
ALTER ROLE airline PASSWORD :'app_password';
SELECT 'CREATE DATABASE airline_operations OWNER airline'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'airline_operations')\gexec
REVOKE ALL ON DATABASE airline_operations FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE airline_operations TO airline;
SQL

systemctl enable --now postgresql nginx
echo "Bootstrap complete. Install the environment file and deployment scripts next."
