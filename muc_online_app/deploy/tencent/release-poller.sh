#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT="${APP_ROOT:-/opt/airline-operations-center}"
ENV_FILE="${DEPLOY_AGENT_ENV:-/etc/airline-operations-center-deploy.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing deployment agent environment: $ENV_FILE" >&2; exit 1; }
set -a
source "$ENV_FILE"
set +a
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
[[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 1

exec 9>"$APP_ROOT/deploy-agent.lock"
flock -n 9 || exit 0

API="https://api.github.com/repos/$GITHUB_REPOSITORY/releases/latest"
AUTH_HEADER="$(mktemp)"
trap 'rm -f "$AUTH_HEADER"' EXIT
printf 'Authorization: Bearer %s\nX-GitHub-Api-Version: 2022-11-28\n' "$GITHUB_TOKEN" > "$AUTH_HEADER"
chmod 0600 "$AUTH_HEADER"
AUTH=(--header "@$AUTH_HEADER")
BOUNDED=(--connect-timeout 15 --max-time 180 --retry 2 --retry-delay 2 --retry-max-time 180)
RELEASE_JSON="$(curl --fail --silent --show-error --location "${BOUNDED[@]}" "${AUTH[@]}" "$API")"
VERSION="$(jq -r '.tag_name // empty' <<<"$RELEASE_JSON")"
[[ -n "$VERSION" ]] || { echo "Latest approved release has no tag" >&2; exit 1; }
[[ "$VERSION" =~ ^production-[0-9a-f]{40}$ ]] || { echo "Latest release is not an approved production release" >&2; exit 1; }
CURRENT="$(basename "$(readlink -f "$APP_ROOT/app/current" 2>/dev/null || true)")"
[[ "$CURRENT" == "$VERSION" ]] && exit 0

archive="$(jq -ce '[.assets[] | select(.name=="airline-operations-center.tar.gz")] | if length==1 then .[0] else error("ambiguous archive") end' <<<"$RELEASE_JSON")"
checksum="$(jq -ce '[.assets[] | select(.name=="airline-operations-center.tar.gz.sha256")] | if length==1 then .[0] else error("ambiguous checksum") end' <<<"$RELEASE_JSON")"
archive_url="$(jq -r .url <<<"$archive")"
checksum_url="$(jq -r .url <<<"$checksum")"
archive_id="$(jq -r .id <<<"$archive")"
checksum_id="$(jq -r .id <<<"$checksum")"
size="$(jq -r .size <<<"$archive")"
digest="$(jq -r '.digest // ""' <<<"$archive")"
[[ "$archive_id" =~ ^[0-9]+$ && "$checksum_id" =~ ^[0-9]+$ && "$size" =~ ^[1-9][0-9]{0,9}$ && "$size" -le 536870912 ]] || exit 1
[[ "$archive_url" == "https://api.github.com/repos/$GITHUB_REPOSITORY/releases/assets/$archive_id" && "$checksum_url" == "https://api.github.com/repos/$GITHUB_REPOSITORY/releases/assets/$checksum_id" ]] || { echo 'Unexpected asset origin' >&2; exit 1; }
[[ -z "$digest" || "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1

WORK="$APP_ROOT/cache/approved-releases/$VERSION"
mkdir -p "$WORK"
chmod 0700 "$WORK"
identity="$archive_id:$size:$digest:$checksum_id"
if [[ -f "$WORK/asset.identity" ]]; then
  [[ "$(cat "$WORK/asset.identity")" == "$identity" ]] || { echo 'Approved asset identity changed; manual review required' >&2; exit 1; }
else
  printf '%s\n' "$identity" > "$WORK/asset.identity"
fi
curl --fail --silent --show-error --location "${BOUNDED[@]}" "${AUTH[@]}" --header "Accept: application/octet-stream" "$checksum_url" -o "$WORK/checksum.pending"
line="$(cat "$WORK/checksum.pending")"
[[ "$line" =~ ^([0-9a-f]{64})[[:space:]]+airline-operations-center\.tar\.gz$ ]] || { echo 'Invalid checksum manifest' >&2; exit 1; }
expected="${BASH_REMATCH[1]}"
[[ -z "$digest" || "$digest" == "sha256:$expected" ]] || { echo 'Release digest mismatch' >&2; exit 1; }
mv "$WORK/checksum.pending" "$WORK/airline-operations-center.tar.gz.sha256"
ARCHIVE="$WORK/airline-operations-center.tar.gz"
PART="$ARCHIVE.part"
verified() { [[ -f "$1" && "$(wc -c < "$1" | tr -d ' ')" == "$size" && "$(sha256sum "$1" | cut -d' ' -f1)" == "$expected" ]]; }
if ! verified "$ARCHIVE"; then
  if ! verified "$PART"; then
    [[ ! -f "$PART" || "$(wc -c < "$PART")" -le "$size" ]] || { echo 'Oversize partial asset; manual review required' >&2; exit 1; }
    # A failed/slow transfer retains its version-bound partial file for the next timer run.
    curl --fail --silent --show-error --location "${BOUNDED[@]}" --speed-limit 8192 --speed-time 30 --continue-at - "${AUTH[@]}" --header "Accept: application/octet-stream" "$archive_url" -o "$PART"
  fi
  verified "$PART" || { echo 'Downloaded release failed size/hash verification' >&2; exit 1; }
  mv "$PART" "$ARCHIVE"
fi
(cd "$WORK" && sha256sum -c airline-operations-center.tar.gz.sha256)
"$APP_ROOT/scripts/deploy.sh" "$ARCHIVE" "$VERSION"
