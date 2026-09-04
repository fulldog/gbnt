#!/usr/bin/env bash
# 安装每 5 分钟 git pull；有更新则编译并用 systemctl 重启业务服务。
# 用法：
#   sudo REPO_DIR=/path/to/gbnt RUN_USER=部署用户 ./install-pull-timer.sh
#   sudo ./install-pull-timer.sh uninstall
set -euo pipefail

SERVICE_NAME="gbnt-pull"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPO_DIR="${REPO_DIR:-${DEFAULT_REPO}}"
RUN_USER="${RUN_USER:-${SUDO_USER:-gbnt}}"
APP_SERVICE="${APP_SERVICE:-gbnt}"
GOPROXY_VAL="${GOPROXY:-https://goproxy.cn,direct}"
LIB_DIR="/usr/local/lib/gbnt"
JOB="${LIB_DIR}/git-pull-rebuild.sh"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "请用 root 执行：sudo REPO_DIR=... RUN_USER=... $0" >&2
    exit 1
  fi
}

uninstall() {
  need_root
  systemctl disable --now "${SERVICE_NAME}.timer" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.timer"
  systemctl daemon-reload
  echo "已卸载 ${SERVICE_NAME}.timer"
}

install_svc() {
  need_root
  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    echo "REPO_DIR 不是 git 仓库: ${REPO_DIR}" >&2
    exit 1
  fi
  if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
    echo "用户不存在: ${RUN_USER}（设置 RUN_USER=有仓库写权限且已配 git 凭证的用户）" >&2
    exit 1
  fi

  HOME_DIR="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
  install -d -m 755 "${LIB_DIR}"
  install -m 755 "${SCRIPT_DIR}/git-pull-rebuild.sh" "${JOB}"
  mkdir -p "${REPO_DIR}/backend/logs"
  chown "${RUN_USER}:" "${REPO_DIR}/backend/logs" 2>/dev/null || true

  cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=gbnt git pull, rebuild then systemctl restart ${APP_SERVICE}
After=network-online.target ${APP_SERVICE}.service

[Service]
Type=oneshot
WorkingDirectory=${REPO_DIR}
Environment=REPO_DIR=${REPO_DIR}
Environment=RUN_USER=${RUN_USER}
Environment=APP_SERVICE=${APP_SERVICE}
Environment=HOME=${HOME_DIR}
Environment=GOPROXY=${GOPROXY_VAL}
Environment=PATH=/usr/local/go/bin:/usr/lib/go-1.27/bin:${HOME_DIR}/go/bin:/usr/bin:/bin
ExecStart=${JOB}
TimeoutStartSec=600
Nice=10
EOF

  cat >"/etc/systemd/system/${SERVICE_NAME}.timer" <<'EOF'
[Unit]
Description=gbnt git pull rebuild every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.timer"
  echo "已启用 ${SERVICE_NAME}.timer（每 5 分钟）"
  echo "  仓库: ${REPO_DIR}"
  echo "  git/编译用户: ${RUN_USER}"
  echo "  重启单元: ${APP_SERVICE}.service（ExecStart 须指向 ${REPO_DIR}/backend/gbnt.service）"
  echo "立刻跑一轮: sudo systemctl start ${SERVICE_NAME}.service"
  echo "日志: journalctl -u ${SERVICE_NAME} -f  以及 ${REPO_DIR}/backend/logs/deploy.log"
  systemctl list-timers "${SERVICE_NAME}.timer" --no-pager || true
}

case "${1:-install}" in
  uninstall|remove)
    uninstall
    ;;
  install|"")
    install_svc
    ;;
  *)
    echo "用法: $0 [install|uninstall]" >&2
    echo "环境变量: REPO_DIR RUN_USER APP_SERVICE GOPROXY" >&2
    exit 1
    ;;
esac
