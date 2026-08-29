#!/usr/bin/env bash
set -euo pipefail

TASKER_APP_DIR="/home/dpkomis/apps/tasker-prod"
TASKER_BACKUP_DIR="$TASKER_APP_DIR/backups"
TASKER_CONFIG_FILE="$TASKER_APP_DIR/.env.offsite-backup"

if [ ! -f "$TASKER_CONFIG_FILE" ]; then
  printf 'Offsite backup skipped: %s is not configured.\n' "$TASKER_CONFIG_FILE"
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$TASKER_CONFIG_FILE"
set +a

: "${TASKER_BACKUP_ENCRYPTION_KEY_FILE:?Set TASKER_BACKUP_ENCRYPTION_KEY_FILE}"
: "${TASKER_OFFSITE_UPLOAD_URL:?Set TASKER_OFFSITE_UPLOAD_URL}"
if [ ! -s "$TASKER_BACKUP_ENCRYPTION_KEY_FILE" ]; then
  echo "The backup encryption key file does not exist or is empty." >&2
  exit 1
fi

latest_backup="$(find "$TASKER_BACKUP_DIR" -maxdepth 1 -type f -name 'tasker-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
if [ -z "$latest_backup" ] || [ ! -s "$latest_backup" ]; then
  echo "No local Tasker backup is available for offsite upload." >&2
  exit 1
fi

umask 077
encrypted_backup="$(mktemp --tmpdir="$TASKER_BACKUP_DIR" '.tasker-offsite.XXXXXX.enc')"
checksum_file="$encrypted_backup.sha256"
cleanup() { rm -f -- "$encrypted_backup" "$checksum_file"; }
trap cleanup EXIT

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
  -pass "file:$TASKER_BACKUP_ENCRYPTION_KEY_FILE" \
  -in "$latest_backup" -out "$encrypted_backup"

remote_name="$(basename "$latest_backup").enc"
sha256sum "$encrypted_backup" | sed "s#$(basename "$encrypted_backup")#$remote_name#" > "$checksum_file"

curl_args=(--fail-with-body --silent --show-error --max-time 600 --retry 3 --retry-all-errors --request POST)
if [ -n "${TASKER_OFFSITE_BEARER_TOKEN:-}" ]; then
  curl_args+=(--header "Authorization: Bearer $TASKER_OFFSITE_BEARER_TOKEN")
fi
if [ -n "${TASKER_OFFSITE_BASIC_USER:-}" ]; then
  curl_args+=(--user "$TASKER_OFFSITE_BASIC_USER:${TASKER_OFFSITE_BASIC_PASSWORD:-}")
fi

backup_url="${TASKER_OFFSITE_UPLOAD_URL//\{filename\}/$remote_name}"
checksum_url="${TASKER_OFFSITE_UPLOAD_URL//\{filename\}/$remote_name.sha256}"
curl "${curl_args[@]}" --header 'Content-Type: application/octet-stream' --header "X-Tasker-Backup-Name: $remote_name" --upload-file "$encrypted_backup" "$backup_url"
curl "${curl_args[@]}" --header 'Content-Type: text/plain' --header "X-Tasker-Backup-Name: $remote_name.sha256" --upload-file "$checksum_file" "$checksum_url"

printf 'Encrypted offsite backup uploaded: %s (%s bytes).\n' "$remote_name" "$(stat -c %s "$encrypted_backup")"
