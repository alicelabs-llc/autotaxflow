#!/usr/bin/env bash
# AutoTaxFlow — DB backup script for Hostinger VPS
#
# Dumps the Postgres DB to /opt/autotaxflow/backups/ and optionally
# uploads to AWS S3 / Cloudflare R2 if AWS_ACCESS_KEY_ID is set.
#
# Cron:
#   0 3 * * * /opt/autotaxflow/scripts/backup-db.sh >> /var/log/autotaxflow-backup.log 2>&1

set -euo pipefail

REPO_DIR="/opt/autotaxflow"
BACKUP_DIR="${REPO_DIR}/backups"
COMPOSE_FILE="${REPO_DIR}/docker-compose.hostinger.yml"
RETENTION_DAYS=14

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="${BACKUP_DIR}/autotaxflow-${TIMESTAMP}.sql.gz"

echo "[$(date)] starting backup → ${DUMP_FILE}"

# Dump desde el container postgres, comprime al vuelo
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-atf}" "${POSTGRES_DB:-autotaxflow}" \
  | gzip > "${DUMP_FILE}"

SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
echo "[$(date)] dump complete — $(echo "scale=1; ${SIZE}/1048576" | bc) MB"

# Upload to S3/R2 if AWS creds are set
if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_S3_BUCKET_NAME:-}" ]]; then
  if command -v aws &>/dev/null; then
    echo "[$(date)] uploading to s3://${AWS_S3_BUCKET_NAME}/backups/..."
    aws s3 cp "${DUMP_FILE}" "s3://${AWS_S3_BUCKET_NAME}/backups/" \
      --endpoint-url "${AWS_S3_ENDPOINT:-}" \
      --region "${AWS_REGION:-auto}" || echo "[$(date)] WARN: S3 upload failed"
  fi
fi

# Local retention — delete backups older than RETENTION_DAYS
echo "[$(date)] pruning local backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "autotaxflow-*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# Count after prune
COUNT=$(find "${BACKUP_DIR}" -name "autotaxflow-*.sql.gz" | wc -l | tr -d ' ')
echo "[$(date)] ${COUNT} backups retained in ${BACKUP_DIR}"
