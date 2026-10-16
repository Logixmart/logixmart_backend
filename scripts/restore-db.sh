#!/usr/bin/env bash
set -euo pipefail

# Restore PostgreSQL data into the Docker container from a .sql dump.
# Usage:
#   ./scripts/restore-db.sh                         # restores latest backup
#   ./scripts/restore-db.sh backups/logixmart_....sql

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-logixmart-postgres}"
DB_USER="${POSTGRES_USER:-logixmart}"
DB_NAME="${POSTGRES_DB:-logixmart}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

if [[ $# -ge 1 ]]; then
  DUMP_FILE="$1"
else
  DUMP_FILE="$(ls -t "$BACKUP_DIR"/logixmart_*.sql 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "${DUMP_FILE:-}" || ! -f "$DUMP_FILE" ]]; then
  echo "Error: dump file not found."
  echo "Usage: ./scripts/restore-db.sh [path/to/backup.sql]"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Error: container '$CONTAINER' is not running."
  echo "Start it with: npm run db:up"
  exit 1
fi

echo "WARNING: This will overwrite data in database '$DB_NAME'."
echo "Dump: $DUMP_FILE"
read -r -p "Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Restoring..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$DUMP_FILE"
echo "Restore completed."
