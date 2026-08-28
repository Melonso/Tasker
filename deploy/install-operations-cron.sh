#!/usr/bin/env bash
set -euo pipefail

TASKER_APP_DIR="/home/dpkomis/apps/tasker-prod"
TASKER_LOG_DIR="$TASKER_APP_DIR/logs"
TASKER_CRON_MARKER="# TASKER_MANAGED_OPERATIONS"

mkdir -p "$TASKER_LOG_DIR"
chmod 700 "$TASKER_LOG_DIR"

existing_crontab="$(crontab -l 2>/dev/null || true)"
filtered_crontab="$(printf '%s\n' "$existing_crontab" | awk -v marker="$TASKER_CRON_MARKER" '
  $0 == marker { skipping=1; next }
  skipping && $0 == "# END_TASKER_MANAGED_OPERATIONS" { skipping=0; next }
  !skipping { print }
')"

{
  printf '%s\n' "$filtered_crontab"
  printf '%s\n' "$TASKER_CRON_MARKER"
  printf '%s\n' "17 2 * * * $TASKER_APP_DIR/deploy/backup-tasker.sh >> $TASKER_LOG_DIR/backup.log 2>&1"
  printf '%s\n' "47 2 * * 0 $TASKER_APP_DIR/deploy/verify-tasker-backup.sh >> $TASKER_LOG_DIR/restore-check.log 2>&1"
  printf '%s\n' "*/5 * * * * $TASKER_APP_DIR/deploy/check-tasker-health.sh >> $TASKER_LOG_DIR/health.log 2>&1"
  printf '%s\n' "# END_TASKER_MANAGED_OPERATIONS"
} | crontab -

printf 'Tasker operations cron installed.\n'
