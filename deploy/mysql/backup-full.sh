#!/usr/bin/env bash
# 全量备份：mysqldump + gzip。默认保留 5 天。可由 systemd 每天 02:00 调用。
set -euo pipefail

CONF="${GBNT_MYSQL_BACKUP_CNF:-/etc/gbnt-mysql-backup.cnf}"
BACKUP_ROOT="${GBNT_MYSQL_BACKUP_DIR:-/var/backups/gbnt-mysql}"
DB="${MYSQL_DB:-gbnt}"
KEEP_DAYS="${GBNT_MYSQL_FULL_KEEP_DAYS:-5}"
FULL_DIR="${BACKUP_ROOT}/full"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${FULL_DIR}/full_${DB}_${STAMP}.sql.gz"
POS_FILE="${BACKUP_ROOT}/last-full.meta"

if [[ ! -f "${CONF}" ]]; then
  echo "缺少 ${CONF}，请从 backup.cnf.example 复制并 chmod 600" >&2
  exit 1
fi

mkdir -p "${FULL_DIR}"
umask 077

DUMP_OPTS=(--defaults-extra-file="${CONF}" --single-transaction --quick
  --routines --events --triggers --hex-blob --set-gtid-purged=OFF)

if mysqldump --help 2>/dev/null | grep -q -- '--source-data'; then
  DUMP_OPTS+=(--source-data=2)
else
  DUMP_OPTS+=(--master-data=2)
fi

# 切 binlog，使本份全量与之后增量边界清晰
mysql --defaults-extra-file="${CONF}" -e "FLUSH BINARY LOGS;"

mysqldump "${DUMP_OPTS[@]}" --databases "${DB}" | gzip -c >"${OUT}.tmp"
mv -f "${OUT}.tmp" "${OUT}"

# 记录转储头中的 binlog 位点，供增量对照
gzip -dc "${OUT}" | head -n 80 | grep -E 'CHANGE (MASTER|REPLICATION SOURCE)' >"${POS_FILE}.tmp" || true
mv -f "${POS_FILE}.tmp" "${POS_FILE}"
echo "file=${OUT}" >>"${POS_FILE}"
echo "time=${STAMP}" >>"${POS_FILE}"

find "${FULL_DIR}" -type f -name 'full_*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
# 不足整天的也限制数量：最多保留 KEEP_DAYS+1 份，防同一天多次手工备份撑爆
ls -1t "${FULL_DIR}"/full_*.sql.gz 2>/dev/null | tail -n "+$((KEEP_DAYS + 2))" | xargs -r rm -f

echo "全量完成: ${OUT}  保留 ${KEEP_DAYS} 天"
