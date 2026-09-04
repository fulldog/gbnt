#!/usr/bin/env bash
# git pull → 有更新则编译到与 install-systemd.sh 相同的 BIN → 成功则 systemctl restart 同名服务。
# 用法：
#   sudo bash git-pull-rebuild.sh              # 立刻跑一轮
#   sudo bash git-pull-rebuild.sh install      # 注册每 5 分钟定时器
#   sudo bash git-pull-rebuild.sh uninstall
# 路径/服务名与 install-systemd.sh 对齐：APP_DIR、BIN、SERVICE_NAME、RUN_USER。
# 不要用 sh 执行（Debian/Ubuntu 的 sh=dash，不支持 pipefail）。
if [ -z "${BASH_VERSION:-}" ]; then
  echo "本脚本需要 bash，请执行：sudo bash $0 $*" >&2
  exit 1
fi
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEFAULT_APP_DIR="${DEFAULT_REPO_DIR}/apps/server"

APP_DIR="${APP_DIR:-${DEFAULT_APP_DIR}}"
BIN="${BIN:-${APP_DIR}/gbnt.service}"
SERVICE_NAME="${SERVICE_NAME:-gbnt}"
RUN_USER="${RUN_USER:-gbnt}"
TIMER_NAME="${TIMER_NAME:-gbnt-pull}"
GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"

REPO_DIR="${REPO_DIR:-${DEFAULT_REPO_DIR}}"

LOG_DIR="${APP_DIR}/logs"
LOG="${LOG_DIR}/deploy.log"
SELF="${SCRIPT_DIR}/$(basename "${BASH_SOURCE[0]}")"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "请用 root 执行：sudo bash $0 $*" >&2
    exit 1
  fi
}

log() {
  mkdir -p "${LOG_DIR}"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG}"
}

# root 时 git/go 用 RUN_USER（需能写仓库、有 git 凭证）；systemctl 仍用 root。
as_deploy() {
  if [[ "${EUID}" -eq 0 && -n "${RUN_USER:-}" && "${RUN_USER}" != "root" ]]; then
    local home
    home="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
    sudo -H -u "${RUN_USER}" env HOME="${home}" GOPROXY="${GOPROXY}" PATH="${PATH}" "$@"
  else
    "$@"
  fi
}

run_job() {
  export PATH="/usr/local/go/bin:/usr/lib/go-1.27/bin:${HOME}/go/bin:/usr/bin:/bin:${PATH}"
  export GOPROXY

  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    log "不是 git 仓库: ${REPO_DIR}"
    exit 1
  fi
  if [[ ! -d "${APP_DIR}" ]]; then
    log "找不到 APP_DIR: ${APP_DIR}"
    exit 1
  fi

  OLD="$(as_deploy git -C "${REPO_DIR}" rev-parse HEAD)"
  log "pull 前 HEAD=${OLD}"
  as_deploy git -C "${REPO_DIR}" pull --ff-only
  NEW="$(as_deploy git -C "${REPO_DIR}" rev-parse HEAD)"
  log "pull 后 HEAD=${NEW}"

  if [[ "${OLD}" == "${NEW}" ]]; then
    log "无更新，跳过编译与重启"
    exit 0
  fi

  if ! as_deploy go version >/dev/null 2>&1; then
    log "未找到 go，中止（不重启 ${SERVICE_NAME}）"
    exit 1
  fi

  log "开始编译 ${BIN}"
  TMP="${BIN}.new"
  as_deploy bash -c "cd $(printf '%q' "${APP_DIR}") && go build -o $(printf '%q' "${TMP}") ./cmd/server"
  chmod +x "${TMP}"
  mv -f "${TMP}" "${BIN}"
  log "编译成功"

  if ! command -v systemctl >/dev/null 2>&1; then
    log "没有 systemctl，无法重启 ${SERVICE_NAME}"
    exit 1
  fi

  log "systemctl restart ${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
  systemctl is-active --quiet "${SERVICE_NAME}"
  log "${SERVICE_NAME} 已重启 pid=$(systemctl show -p MainPID --value "${SERVICE_NAME}")"
}

uninstall_timer() {
  need_root
  systemctl disable --now "${TIMER_NAME}.timer" 2>/dev/null || true
  rm -f "/etc/systemd/system/${TIMER_NAME}.service" "/etc/systemd/system/${TIMER_NAME}.timer"
  systemctl daemon-reload
  echo "已卸载 ${TIMER_NAME}.timer"
}

install_timer() {
  need_root
  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    echo "不是 git 仓库: ${REPO_DIR}" >&2
    exit 1
  fi
  if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
    echo "用户不存在: ${RUN_USER}（git pull/编译用；可与 install-systemd.sh 的 RUN_USER 相同，或改成有 git 凭证的账号）" >&2
    exit 1
  fi
  if [[ ! -f "${SELF}" ]]; then
    echo "找不到脚本: ${SELF}" >&2
    exit 1
  fi

  mkdir -p "${LOG_DIR}"
  chown "${RUN_USER}:" "${LOG_DIR}" 2>/dev/null || true
  chmod +x "${SELF}" 2>/dev/null || true

  local home
  home="$(getent passwd "${RUN_USER}" | cut -d: -f6)"

  cat >"/etc/systemd/system/${TIMER_NAME}.service" <<EOF
[Unit]
Description=gbnt git pull, rebuild ${BIN}, systemctl restart ${SERVICE_NAME}
After=network-online.target ${SERVICE_NAME}.service

[Service]
Type=oneshot
WorkingDirectory=${APP_DIR}
Environment=APP_DIR=${APP_DIR}
Environment=BIN=${BIN}
Environment=SERVICE_NAME=${SERVICE_NAME}
Environment=RUN_USER=${RUN_USER}
Environment=REPO_DIR=${REPO_DIR}
Environment=HOME=${home}
Environment=GOPROXY=${GOPROXY}
Environment=PATH=/usr/local/go/bin:/usr/lib/go-1.27/bin:${home}/go/bin:/usr/bin:/bin
ExecStart=/bin/bash ${SELF} run
TimeoutStartSec=600
Nice=10
EOF

  cat >"/etc/systemd/system/${TIMER_NAME}.timer" <<'EOF'
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
  systemctl enable --now "${TIMER_NAME}.timer"
  echo "已启用 ${TIMER_NAME}.timer（每 5 分钟）"
  echo "  仓库: ${REPO_DIR}"
  echo "  工作目录/编译: ${APP_DIR}"
  echo "  二进制: ${BIN}"
  echo "  重启单元: ${SERVICE_NAME}.service"
  echo "  git/编译用户: ${RUN_USER}"
  echo "立刻跑一轮: sudo systemctl start ${TIMER_NAME}.service"
  echo "日志: journalctl -u ${TIMER_NAME} -f  以及 ${LOG}"
  systemctl list-timers "${TIMER_NAME}.timer" --no-pager || true
}

case "${1:-run}" in
  run|"")
    run_job
    ;;
  install)
    install_timer
    ;;
  uninstall|remove)
    uninstall_timer
    ;;
  *)
    echo "用法: sudo bash $0 [run|install|uninstall]" >&2
    echo "环境变量: APP_DIR BIN SERVICE_NAME RUN_USER REPO_DIR TIMER_NAME GOPROXY" >&2
    echo "默认与 install-systemd.sh 一致: SERVICE_NAME=gbnt BIN=\$APP_DIR/gbnt.service" >&2
    exit 1
    ;;
esac
