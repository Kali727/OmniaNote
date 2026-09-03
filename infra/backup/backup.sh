#!/bin/bash
set -Eeuo pipefail

BACKUP_DIR=/backups
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "$BACKUP_DIR/postgres"

log() { echo "[$(date -Iseconds)] $*"; }

run_backup() {
  local ts dump_file
  ts=$(date +%Y%m%d-%H%M%S)
  dump_file="$BACKUP_DIR/postgres/omnianote-${ts}.sql.gz"

  log "Starting backup..."

  # Logical dump (pg_dump), not a filesystem snapshot — small, portable across Postgres
  # versions/hosts, and always internally consistent without needing to pause the database.
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip >"$dump_file"
  log "Postgres dump written: $dump_file ($(du -h "$dump_file" | cut -f1))"

  find "$BACKUP_DIR/postgres" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
  log "Pruned local dumps older than ${RETENTION_DAYS} days"

  if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
    mc alias set local "http://minio:9000" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
    mc alias set remote "$BACKUP_S3_ENDPOINT" "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" >/dev/null
    # A fresh off-site bucket won't exist yet on first run — mc mirror doesn't create
    # its target. --ignore-existing makes this a no-op once it does.
    mc mb --ignore-existing "remote/${BACKUP_S3_BUCKET}" >/dev/null

    if mc mirror --overwrite --quiet "$BACKUP_DIR/postgres" "remote/${BACKUP_S3_BUCKET}/postgres" \
      && mc mirror --overwrite --quiet "local/${S3_BUCKET}" "remote/${BACKUP_S3_BUCKET}/media"; then
      log "Mirrored Postgres dumps and media bucket to remote/${BACKUP_S3_BUCKET}"
    else
      log "OFF-SITE MIRROR FAILED — local backup above still succeeded, but this run is not backed up off-site"
      return 1
    fi
  else
    log "BACKUP_S3_ENDPOINT not set — local-only backup. This volume is only as safe as the" \
        "disk it's on; set the BACKUP_S3_* vars (see infra/.env.example) for real disaster recovery."
  fi

  log "Backup complete."
}

while true; do
  run_backup || log "Backup FAILED — will retry next interval"
  sleep "$INTERVAL_SECONDS"
done
