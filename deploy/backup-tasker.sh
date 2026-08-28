#!/usr/bin/env bash
set -euo pipefail

TASKER_APP_DIR="/home/dpkomis/apps/tasker-prod"
TASKER_BACKUP_DIR="$TASKER_APP_DIR/backups"
TASKER_COMPOSE_FILE="$TASKER_APP_DIR/docker-compose.prod.yml"

umask 077
mkdir -p "$TASKER_BACKUP_DIR"

resolved_app_dir="$(realpath "$TASKER_APP_DIR")"
resolved_backup_dir="$(realpath "$TASKER_BACKUP_DIR")"
case "$resolved_backup_dir" in
  "$resolved_app_dir"/*) ;;
  *) echo "Backup directory is outside the Tasker application directory." >&2; exit 1 ;;
esac

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_backup="$(mktemp --tmpdir="$TASKER_BACKUP_DIR" ".tasker-$timestamp.XXXXXX.dump")"
final_backup="$TASKER_BACKUP_DIR/tasker-$timestamp.dump"

cleanup() {
  if [ -f "$temporary_backup" ]; then rm -f -- "$temporary_backup"; fi
}
trap cleanup EXIT

cd "$TASKER_APP_DIR"
docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres \
  pg_dump -U tasker -d tasker --format=custom --no-owner --no-privileges > "$temporary_backup"
test -s "$temporary_backup"
docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres pg_restore --list < "$temporary_backup" >/dev/null
mv -- "$temporary_backup" "$final_backup"
chmod 600 "$final_backup"

find "$TASKER_BACKUP_DIR" -maxdepth 1 -type f -name 'tasker-*.dump' -mtime +14 -delete
printf 'Tasker backup ready: %s (%s bytes)\n' "$final_backup" "$(stat -c %s "$final_backup")"
