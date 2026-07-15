#!/usr/bin/env sh
set -eu
umask 077

cd /app/api

run_pre_migration_backup() {
  if [ "${AE_NETSCOPE_PRE_MIGRATION_BACKUP:-true}" != "true" ]; then
    echo "Pre-migration PostgreSQL backup disabled." >&2
    return 0
  fi

  if [ -n "${DATABASE_URL:-}" ] && printf "%s" "$DATABASE_URL" | grep -q "sqlite"; then
    echo "Skipping pre-migration backup for SQLite database." >&2
    return 0
  fi

  backup_dir="${AE_NETSCOPE_MIGRATION_BACKUP_DIR:-/app/backups}"
  mkdir -p "$backup_dir"

  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="${backup_dir}/ae-netscope-pre-migration-${timestamp}.dump"

  export PGPASSWORD="${POSTGRES_PASSWORD:-}"
  echo "Creating pre-migration PostgreSQL backup at ${backup_file}..." >&2
  if ! pg_dump \
      --host="${POSTGRES_HOST:-127.0.0.1}" \
      --port="${POSTGRES_PORT:-5432}" \
      --username="${POSTGRES_USER:-ae_netscope}" \
      --dbname="${POSTGRES_DB:-ae_netscope}" \
      --format=custom \
      --file="$backup_file"; then
    rm -f -- "$backup_file"
    return 1
  fi
  chmod 600 "$backup_file"

  retention_count="${AE_NETSCOPE_MIGRATION_BACKUP_RETENTION_COUNT:-10}"
  case "$retention_count" in
    ''|*[!0-9]*) retention_count=10 ;;
  esac
  if [ "$retention_count" -gt 0 ]; then
    find "$backup_dir" -maxdepth 1 -type f -name 'ae-netscope-pre-migration-*.dump' \
      -printf '%f\n' \
      | sort -r \
      | awk -v keep="$retention_count" 'NR > keep' \
      | while IFS= read -r expired_backup; do
          rm -f -- "$backup_dir/$expired_backup"
        done
  fi
}

if [ "${AE_NETSCOPE_RUN_MIGRATIONS:-true}" = "true" ]; then
  attempts="${AE_NETSCOPE_MIGRATION_ATTEMPTS:-30}"
  delay="${AE_NETSCOPE_MIGRATION_RETRY_SECONDS:-2}"
  count=1
  backup_done="false"
  until {
    if python -m alembic current --check-heads >/dev/null 2>&1; then
      echo "Database schema is already at the migration head." >&2
      true
    elif [ "$backup_done" != "true" ]; then
      if ! run_pre_migration_backup; then
        false
      else
        backup_done="true"
        python -m alembic upgrade head
      fi
    else
      python -m alembic upgrade head
    fi
  }; do
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
