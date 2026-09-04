#!/usr/bin/env bash
# 仓库根目录 git pull；有新提交则编译 backend/gbnt.service，成功后 systemctl 重启业务服务。
# 环境变量：REPO_DIR、RUN_USER、APP_SERVICE、GOPROXY
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${REPO_DIR:-}" ]]; then
  REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
fi

BACKEND="${REPO_DIR}/backend"
BIN="${BIN:-${BACKEND}/gbnt.service}"
APP_SERVICE="${APP_SERVICE:-gbnt}"
LOG_DIR="${BACKEND}/logs"
LOG="${LOG_DIR}/deploy.log"

mkdir -p "${LOG_DIR}"
umask 027

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG}"
}

# root 跑定时器时，git/go 用 RUN_USER（凭证与模块缓存）；systemctl 仍用 root。
as_deploy() {
  if [[ "${EUID}" -eq 0 && -n "${RUN_USER:-}" && "${RUN_USER}" != "root" ]]; then
    local home
    home="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
    sudo -H -u "${RUN_USER}" env HOME="${home}" GOPROXY="${GOPROXY}" PATH="${PATH}" "$@"
  else
    "$@"
  fi
}

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  log "不是 git 仓库: ${REPO_DIR}"
  exit 1
fi
if [[ ! -d "${BACKEND}" ]]; then
  log "找不到 backend: ${BACKEND}"
  exit 1
fi

export PATH="/usr/local/go/bin:/usr/lib/go-1.27/bin:${HOME}/go/bin:/usr/bin:/bin:${PATH}"
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"

OLD="$(as_deploy git -C "${REPO_DIR}" rev-parse HEAD)"
log "pull 前 HEAD=${OLD}"
as_deploy git -C "${REPO_DIR}" pull --ff-only
NEW="$(as_deploy git -C "${REPO_DIR}" rev-parse HEAD)"
log "pull 后 HEAD=${NEW}"

if [[ "${OLD}" == "${NEW}" ]]; then
  log "无更新，跳过编译"
  exit 0
fi

if ! as_deploy go version >/dev/null 2>&1; then
  log "未找到 go，中止（不重启服务）"
  exit 1
fi

log "开始编译 ${BIN}"
TMP="${BIN}.new"
as_deploy bash -c "cd $(printf '%q' "${BACKEND}") && go build -o $(printf '%q' "${TMP}") ./cmd/server"
chmod +x "${TMP}"
mv -f "${TMP}" "${BIN}"
log "编译成功"

if ! command -v systemctl >/dev/null 2>&1; then
  log "没有 systemctl，无法重启 ${APP_SERVICE}"
  exit 1
fi

log "systemctl restart ${APP_SERVICE}"
systemctl restart "${APP_SERVICE}"
systemctl is-active --quiet "${APP_SERVICE}"
log "${APP_SERVICE} 已重启 $(systemctl show -p MainPID --value "${APP_SERVICE}")"
