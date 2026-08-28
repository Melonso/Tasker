#!/usr/bin/env bash
set -euo pipefail

TASKER_APP_DIR="/home/dpkomis/apps/tasker-prod"
TASKER_BACKUP_DIR="$TASKER_APP_DIR/backups"
TASKER_COMPOSE_FILE="$TASKER_APP_DIR/docker-compose.prod.yml"

latest_backup="$(find "$TASKER_BACKUP_DIR" -maxdepth 1 -type f -name 'tasker-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
if [ -z "$latest_backup" ] || [ ! -f "$latest_backup" ]; then
  echo "No Tasker backup is available for verification." >&2
  exit 1
fi

restore_database="tasker_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
case "$restore_database" in
  tasker_restore_check_[0-9]*) ;;
  *) echo "Invalid restore-check database name." >&2; exit 1 ;;
esac

cd "$TASKER_APP_DIR"
cleanup() {
  docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres \
    dropdb -U tasker --if-exists "$restore_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres createdb -U tasker "$restore_database"
docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres \
  pg_restore -U tasker -d "$restore_database" --no-owner --no-privileges < "$latest_backup"

table_count="$(docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres \
  psql -U tasker -d "$restore_database" -Atc "select count(*) from information_schema.tables where table_schema='public';")"
if [ "$table_count" -lt 20 ]; then
  echo "Restore verification found only $table_count public tables." >&2
  exit 1
fi

printf 'Tasker restore verification passed for %s (%s public tables).\n' "$latest_backup" "$table_count"
