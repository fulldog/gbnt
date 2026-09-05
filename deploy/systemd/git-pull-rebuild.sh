#!/usr/bin/env bash
# git pull → 有更新则按变更编译 Go 和/或打包 admin-web；Go 编成功才 systemctl restart。
# 用法：
#   sudo bash git-pull-rebuild.sh              # 立刻跑一轮（有 git 更新才编译）
#   sudo bash git-pull-rebuild.sh force        # 不 pull、不看 HEAD，强制编 Go/前端并重启
#   sudo bash git-pull-rebuild.sh install      # 注册每 5 分钟定时器
#   sudo bash git-pull-rebuild.sh uninstall
# 路径/服务名与 install-systemd.sh 对齐：APP_DIR、BIN、SERVICE_NAME、RUN_USER。
# 前端：仓库根 pnpm install --frozen-lockfile && pnpm --filter @gbnt/admin-web build
# 产物默认 apps/admin-web/dist（Nginx root 指向此处则无需 reload）。
# BUILD_ADMIN=0 跳过前端。RUN_USER 的 PATH 上需有 go；打包前端还需 pnpm 或带 corepack 的 Node。
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
BUILD_ADMIN="${BUILD_ADMIN:-1}"
FORCE="${FORCE:-0}"

REPO_DIR="${REPO_DIR:-${DEFAULT_REPO_DIR}}"
ADMIN_DIR="${ADMIN_DIR:-${REPO_DIR}/apps/admin-web}"

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

# Git 2.35.2+：执行用户与目录属主不一致会报 dubious ownership。
# 只对本仓库设置，不写 ~/.gitconfig。
repo_git() {
  as_deploy git -c "safe.directory=${REPO_DIR}" -C "${REPO_DIR}" "$@"
}

# root 时：仓库属主是 RUN_USER 且该用户存在，则 git/go/pnpm 用该用户；否则留在 root
#（常见于 root 克隆到 /opt/www/gbnt）。systemctl 仍用 root。
as_deploy() {
  if [[ "${EUID}" -eq 0 && -n "${RUN_USER:-}" && "${RUN_USER}" != "root" ]] \
    && id -u "${RUN_USER}" >/dev/null 2>&1; then
    local owner
    owner="$(stat -c %U "${REPO_DIR}" 2>/dev/null || true)"
    if [[ "${owner}" == "${RUN_USER}" ]]; then
      local home
      home="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
      sudo -H -u "${RUN_USER}" env HOME="${home}" GOPROXY="${GOPROXY}" PATH="${PATH}" CI="${CI:-true}" "$@"
      return
    fi
  fi
  "$@"
}

run_job() {
  local deploy_home
  deploy_home="$(getent passwd "${RUN_USER}" | cut -d: -f6 || true)"
  export PATH="/usr/local/go/bin:/usr/lib/go-1.27/bin:${deploy_home:+${deploy_home}/go/bin:}/usr/local/bin:/usr/bin:/bin:${PATH:-}"
  export GOPROXY
  export CI=true

  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    log "不是 git 仓库: ${REPO_DIR}"
    exit 1
  fi
  if [[ ! -d "${APP_DIR}" ]]; then
    log "找不到 APP_DIR: ${APP_DIR}"
    exit 1
  fi

  local repo_owner
  repo_owner="$(stat -c %U "${REPO_DIR}" 2>/dev/null || true)"
  if [[ "${EUID}" -eq 0 && -n "${repo_owner}" && "${repo_owner}" != "${RUN_USER}" ]]; then
    log "仓库属主是 ${repo_owner}，与 RUN_USER=${RUN_USER} 不同，git/编译以当前用户执行；已设 safe.directory。建议: chown -R ${RUN_USER}: ${REPO_DIR}"
  fi

  local changed need_go need_admin
  need_go=0
  need_admin=0

  if [[ "${FORCE}" == "1" ]]; then
    log "强制编译：跳过 git pull 与变更判断 HEAD=$(repo_git rev-parse HEAD)"
    need_go=1
    if [[ "${BUILD_ADMIN}" != "0" ]]; then
      need_admin=1
    fi
  else
    OLD="$(repo_git rev-parse HEAD)"
    log "pull 前 HEAD=${OLD}"
    repo_git pull --ff-only
    NEW="$(repo_git rev-parse HEAD)"
    log "pull 后 HEAD=${NEW}"

    if [[ "${OLD}" == "${NEW}" ]]; then
      log "无更新，跳过编译与重启"
      exit 0
    fi

    changed="$(repo_git diff --name-only "${OLD}" "${NEW}" || true)"
    if printf '%s\n' "${changed}" | grep -qE '^apps/server/'; then
      need_go=1
    fi
    if [[ "${BUILD_ADMIN}" != "0" ]] && printf '%s\n' "${changed}" | grep -qE '^(apps/admin-web/|packages/|pnpm-lock.yaml|pnpm-workspace.yaml|package.json$)'; then
      need_admin=1
    fi
    if [[ "${need_go}" -eq 0 && "${need_admin}" -eq 0 ]]; then
      log "HEAD 有变化但无 apps/server 或管理后台相关文件，跳过编译与重启"
      exit 0
    fi
  fi

  if [[ "${need_go}" -eq 1 ]]; then
    if ! as_deploy go version >/dev/null 2>&1; then
      log "未找到 go，中止（不重启 ${SERVICE_NAME}）"
      exit 1
    fi
    log "开始编译 ${BIN}"
    TMP="${BIN}.new"
    as_deploy bash -c "cd $(printf '%q' "${APP_DIR}") && go build -o $(printf '%q' "${TMP}") ."
    chmod +x "${TMP}"
    mv -f "${TMP}" "${BIN}"
    log "Go 编译成功"
  fi

  if [[ "${need_admin}" -eq 1 ]]; then
    if [[ ! -d "${ADMIN_DIR}" ]]; then
      log "找不到管理后台目录: ${ADMIN_DIR}"
      exit 1
    fi
    log "开始打包 @gbnt/admin-web → ${ADMIN_DIR}/dist"
    as_deploy env CI=true bash -c "
set -euo pipefail
cd $(printf '%q' "${REPO_DIR}")
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
  pnpm --filter @gbnt/admin-web build
elif command -v corepack >/dev/null 2>&1; then
  corepack pnpm install --frozen-lockfile
  corepack pnpm --filter @gbnt/admin-web build
else
  echo '未找到 pnpm 或 corepack，无法打包管理后台（给 RUN_USER 安装 Node.js + pnpm，或设 BUILD_ADMIN=0）' >&2
  exit 1
fi
"
    log "管理后台打包成功"
  fi

  if [[ "${need_go}" -eq 0 ]]; then
    exit 0
  fi

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
Description=gbnt git pull, rebuild API and admin-web, restart ${SERVICE_NAME} if Go rebuilt
After=network-online.target ${SERVICE_NAME}.service

[Service]
Type=oneshot
WorkingDirectory=${APP_DIR}
Environment=APP_DIR=${APP_DIR}
Environment=BIN=${BIN}
Environment=SERVICE_NAME=${SERVICE_NAME}
Environment=RUN_USER=${RUN_USER}
Environment=REPO_DIR=${REPO_DIR}
Environment=ADMIN_DIR=${ADMIN_DIR}
Environment=BUILD_ADMIN=${BUILD_ADMIN}
Environment=HOME=${home}
Environment=GOPROXY=${GOPROXY}
Environment=CI=true
Environment=PATH=/usr/local/go/bin:/usr/lib/go-1.27/bin:${home}/go/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/bash ${SELF} run
TimeoutStartSec=1800
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
  echo "  工作目录/Go 编译: ${APP_DIR}"
  echo "  二进制: ${BIN}"
  echo "  管理后台: ${ADMIN_DIR}（BUILD_ADMIN=${BUILD_ADMIN}）"
  echo "  重启单元: ${SERVICE_NAME}.service（仅 apps/server 有变更时）"
  echo "  git/编译用户: ${RUN_USER}"
  echo "立刻跑一轮: sudo systemctl start ${TIMER_NAME}.service"
  echo "日志: journalctl -u ${TIMER_NAME} -f  以及 ${LOG}"
  systemctl list-timers "${TIMER_NAME}.timer" --no-pager || true
}

for arg in "$@"; do
  case "${arg}" in
    force|--force|-f)
      FORCE=1
      ;;
  esac
done

cmd="${1:-run}"
if [[ "${cmd}" == "force" || "${cmd}" == "--force" || "${cmd}" == "-f" ]]; then
  cmd="run"
fi

case "${cmd}" in
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
    echo "用法: sudo bash $0 [run|force|install|uninstall]" >&2
    echo "force / --force / -f：跳过 git pull 与 HEAD 判断，强制编译并重启" >&2
    echo "环境变量: APP_DIR BIN SERVICE_NAME RUN_USER REPO_DIR ADMIN_DIR BUILD_ADMIN FORCE TIMER_NAME GOPROXY" >&2
    echo "默认与 install-systemd.sh 一致: SERVICE_NAME=gbnt BIN=\$APP_DIR/gbnt.service" >&2
    exit 1
    ;;
esac
