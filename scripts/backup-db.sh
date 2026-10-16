#!/usr/bin/env bash
set -euo pipefail

# Backup PostgreSQL data from the Docker container.
# Usage: ./scripts/backup-db.sh
# Env overrides: POSTGRES_CONTAINER, POSTGRES_USER, POSTGRES_DB, BACKUP_DIR, KEEP_DAYS

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-logixmart-postgres}"
DB_USER="${POSTGRES_USER:-logixmart}"
DB_NAME="${POSTGRES_DB:-logixmart}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Error: container '$CONTAINER' is not running."
  echo "Start it with: npm run db:up"
  exit 1
fi

STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/logixmart_${STAMP}.sql"

echo "Backing up database '$DB_NAME' from '$CONTAINER'..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists > "$OUT_FILE"

# Drop empty/failed dumps
if [[ ! -s "$OUT_FILE" ]]; then
  rm -f "$OUT_FILE"
  echo "Error: backup file is empty."
  exit 1
fi

SIZE="$(du -h "$OUT_FILE" | awk '{print $1}')"
echo "Backup saved: $OUT_FILE ($SIZE)"

# Optional retention: delete dumps older than KEEP_DAYS
if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name 'logixmart_*.sql' -type f -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
  echo "Retention: kept backups from the last $KEEP_DAYS day(s)."
fi
