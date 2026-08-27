#!/usr/bin/env bash
# 安装全量/增量 systemd timer：每天 02:00 全量（保留 5 天），每小时增量。
# 用法：sudo ./install-backup.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 执行" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${GBNT_MYSQL_BACKUP_DIR:-/var/backups/gbnt-mysql}"
CONF="${GBNT_MYSQL_BACKUP_CNF:-/etc/gbnt-mysql-backup.cnf}"
KEEP_DAYS="${GBNT_MYSQL_FULL_KEEP_DAYS:-5}"

install -d -m 700 "${BACKUP_ROOT}"
install -d -m 755 /usr/local/lib/gbnt-mysql
install -m 755 "${SCRIPT_DIR}/backup-full.sh" /usr/local/lib/gbnt-mysql/backup-full.sh
install -m 755 "${SCRIPT_DIR}/backup-incr.sh" /usr/local/lib/gbnt-mysql/backup-incr.sh

if [[ ! -f "${CONF}" ]]; then
  install -m 600 "${SCRIPT_DIR}/backup.cnf.example" "${CONF}"
  echo "已写入 ${CONF}，请编辑其中 password 后再启动定时器：" >&2
  echo "  sudo nano ${CONF}" >&2
  echo "  sudo chmod 600 ${CONF}" >&2
fi

cat >/etc/systemd/system/gbnt-mysql-full.service <<EOF
[Unit]
Description=gbnt MySQL full backup
After=mysql.service mysqld.service
Wants=mysql.service mysqld.service

[Service]
Type=oneshot
Environment=GBNT_MYSQL_BACKUP_CNF=${CONF}
Environment=GBNT_MYSQL_BACKUP_DIR=${BACKUP_ROOT}
Environment=GBNT_MYSQL_FULL_KEEP_DAYS=${KEEP_DAYS}
Environment=MYSQL_DB=gbnt
ExecStart=/usr/local/lib/gbnt-mysql/backup-full.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF

cat >/etc/systemd/system/gbnt-mysql-full.timer <<'EOF'
[Unit]
Description=gbnt MySQL full backup daily 02:00

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
EOF

cat >/etc/systemd/system/gbnt-mysql-incr.service <<EOF
[Unit]
Description=gbnt MySQL incremental (binlog) backup
After=mysql.service mysqld.service

[Service]
Type=oneshot
Environment=GBNT_MYSQL_BACKUP_CNF=${CONF}
Environment=GBNT_MYSQL_BACKUP_DIR=${BACKUP_ROOT}
Environment=GBNT_MYSQL_INCR_KEEP_DAYS=6
ExecStart=/usr/local/lib/gbnt-mysql/backup-incr.sh
Nice=10
EOF

cat >/etc/systemd/system/gbnt-mysql-incr.timer <<'EOF'
[Unit]
Description=gbnt MySQL incremental backup hourly

[Timer]
OnCalendar=hourly
Persistent=true
AccuracySec=5min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now gbnt-mysql-full.timer gbnt-mysql-incr.timer

echo "已启用定时器："
systemctl list-timers 'gbnt-mysql-*' --no-pager
echo
echo "立即试跑全量: sudo systemctl start gbnt-mysql-full.service"
echo "立即试跑增量: sudo systemctl start gbnt-mysql-incr.service"
echo "日志: journalctl -u gbnt-mysql-full -u gbnt-mysql-incr -f"
echo "备份目录: ${BACKUP_ROOT}/{full,incr}"
