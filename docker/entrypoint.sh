#!/usr/bin/env sh
set -eu

cd /app/api

if [ "${AE_NETSCOPE_RUN_MIGRATIONS:-true}" = "true" ]; then
  attempts="${AE_NETSCOPE_MIGRATION_ATTEMPTS:-30}"
  delay="${AE_NETSCOPE_MIGRATION_RETRY_SECONDS:-2}"
  count=1
  until python -m alembic upgrade head; do
    if [ "$count" -ge "$attempts" ]; then
      echo "Database migrations failed after ${attempts} attempts." >&2
      exit 1
    fi
    echo "Database is not ready for migrations yet. Retry ${count}/${attempts}..." >&2
    count=$((count + 1))
    sleep "$delay"
  done
fi

exec "$@"
