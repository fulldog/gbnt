#!/usr/bin/env bash
# 增量：FLUSH + 复制 datadir 中已切换完成的 binlog 到备份盘。
# 建议每小时跑一次；与全量配合即可按位点恢复。
set -euo pipefail

CONF="${GBNT_MYSQL_BACKUP_CNF:-/etc/gbnt-mysql-backup.cnf}"
BACKUP_ROOT="${GBNT_MYSQL_BACKUP_DIR:-/var/backups/gbnt-mysql}"
KEEP_DAYS="${GBNT_MYSQL_INCR_KEEP_DAYS:-6}"
INCR_DIR="${BACKUP_ROOT}/incr"

if [[ ! -f "${CONF}" ]]; then
  echo "缺少 ${CONF}" >&2
  exit 1
fi

mkdir -p "${INCR_DIR}"
umask 077

mysql --defaults-extra-file="${CONF}" -e "FLUSH BINARY LOGS;"

BINLOG_DIR="$(mysql --defaults-extra-file="${CONF}" -N -s -e "SELECT @@global.log_bin_basename;" | xargs dirname)"
if [[ -z "${BINLOG_DIR}" || ! -d "${BINLOG_DIR}" ]]; then
  echo "读不到 log_bin 目录，请确认已开启 log_bin" >&2
  exit 1
fi

# 当前正在写入的文件不强制拷完整；拷贝 index 与已关闭的 binlog
INDEX="$(mysql --defaults-extra-file="${CONF}" -N -s -e "SELECT @@global.log_bin_index;")"
if [[ -n "${INDEX}" && -f "${INDEX}" ]]; then
  cp -a "${INDEX}" "${INCR_DIR}/"
fi

shopt -s nullglob
for f in "${BINLOG_DIR}"/mysql-bin.[0-9]*; do
  base="$(basename "${f}")"
  dest="${INCR_DIR}/${base}"
  # 已关闭文件大小稳定则覆盖拷贝；当前活跃文件也定期同步（cp 即可）
  cp -a "${f}" "${dest}.tmp"
  mv -f "${dest}.tmp" "${dest}"
done

find "${INCR_DIR}" -type f -mtime "+${KEEP_DAYS}" ! -name '*.index' -delete

echo "增量完成: ${INCR_DIR}  binlog 目录 ${BINLOG_DIR}"
