#!/usr/bin/env bash
set -euo pipefail

TASKER_APP_DIR="/home/dpkomis/apps/tasker-prod"
TASKER_COMPOSE_FILE="$TASKER_APP_DIR/docker-compose.prod.yml"

ready_response="$(curl --fail --silent --show-error --max-time 15 https://tasker.dpkomis.pl/api/health/operations)"
if [[ "$ready_response" != *'"status":"operational"'* ]]; then
  echo "Unexpected Tasker operations response: $ready_response" >&2
  exit 1
fi

cd "$TASKER_APP_DIR"
worker_state="$(docker compose -f "$TASKER_COMPOSE_FILE" exec -T postgres psql -U tasker -d tasker -Atc \
  "select case when last_seen_at > now() - interval '3 minutes' then 'healthy' else 'stale' end from worker_heartbeats where service='reminder-worker';")"
if [ "$worker_state" != "healthy" ]; then
  echo "Tasker worker heartbeat is $worker_state." >&2
  exit 1
fi

printf 'Tasker health check passed.\n'
