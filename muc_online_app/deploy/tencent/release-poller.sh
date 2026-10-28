#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ENV_FILE="${DEPLOY_AGENT_ENV:-/etc/airline-operations-center-deploy.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing deployment agent environment: $ENV_FILE" >&2; exit 1; }
set -a
source "$ENV_FILE"
set +a
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

exec 9>"$APP_ROOT/deploy-agent.lock"
flock -n 9 || exit 0

API="https://api.github.com/repos/$GITHUB_REPOSITORY/releases/latest"
AUTH_HEADER="$(mktemp)"
WORK=""
trap 'rm -rf "${WORK:-}" "${AUTH_HEADER:-}"' EXIT
printf 'Authorization: Bearer %s\nX-GitHub-Api-Version: 2022-11-28\n' "$GITHUB_TOKEN" > "$AUTH_HEADER"
chmod 0600 "$AUTH_HEADER"
AUTH=(--header "@$AUTH_HEADER")
RELEASE_JSON="$(curl --fail --silent --show-error --location "${AUTH[@]}" "$API")"
VERSION="$(jq -r '.tag_name // empty' <<<"$RELEASE_JSON")"
[[ -n "$VERSION" ]] || { echo "Latest approved release has no tag" >&2; exit 1; }
[[ "$VERSION" =~ ^production-[A-Za-z0-9._-]+$ ]] || { echo "Latest release is not an approved production release: $VERSION" >&2; exit 1; }
CURRENT="$(basename "$(readlink -f "$APP_ROOT/app/current" 2>/dev/null || true)")"
[[ "$CURRENT" == "$VERSION" ]] && exit 0

archive_url="$(jq -r '.assets[] | select(.name=="airline-operations-center.tar.gz") | .url' <<<"$RELEASE_JSON")"
checksum_url="$(jq -r '.assets[] | select(.name=="airline-operations-center.tar.gz.sha256") | .url' <<<"$RELEASE_JSON")"
[[ -n "$archive_url" && "$archive_url" != "null" && -n "$checksum_url" && "$checksum_url" != "null" ]] || {
  echo "Approved release is missing deployment assets" >&2
  exit 1
}

WORK="$(mktemp -d)"
curl --fail --silent --show-error --location "${AUTH[@]}" --header "Accept: application/octet-stream" "$archive_url" -o "$WORK/airline-operations-center.tar.gz"
curl --fail --silent --show-error --location "${AUTH[@]}" --header "Accept: application/octet-stream" "$checksum_url" -o "$WORK/airline-operations-center.tar.gz.sha256"
(cd "$WORK" && sha256sum -c airline-operations-center.tar.gz.sha256)
"$APP_ROOT/scripts/deploy.sh" "$WORK/airline-operations-center.tar.gz" "$VERSION"
