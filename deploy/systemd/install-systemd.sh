#!/usr/bin/env bash
# 将 gbnt 后台注册为 systemd 服务（需 root）。
# 用法：
#   sudo ./install-systemd.sh
#   sudo bash install-systemd.sh
#   sudo APP_DIR=/opt/gbnt BIN=/opt/gbnt/gbnt.service ./install-systemd.sh
#   sudo ./install-systemd.sh uninstall
# 不要用 sh 执行（Debian/Ubuntu 的 sh=dash，不支持 pipefail）。
if [ -z "${BASH_VERSION:-}" ]; then
  echo "本脚本需要 bash，请执行：sudo bash $0 $*" >&2
  exit 1
fi
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-gbnt}"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEFAULT_APP_DIR="${DEFAULT_REPO_DIR}/apps/server"

APP_DIR="${APP_DIR:-${DEFAULT_APP_DIR}}"
RUN_USER="${RUN_USER:-gbnt}"
RUN_GROUP="${RUN_GROUP:-${RUN_USER}}"
BIN="${BIN:-${APP_DIR}/gbnt.service}"
CONFIG="${CONFIG:-${APP_DIR}/configs/config.yaml}"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "请用 root 执行：sudo $0 $*" >&2
    exit 1
  fi
}

uninstall() {
  need_root
  if systemctl list-unit-files "${SERVICE_NAME}.service" &>/dev/null; then
    systemctl disable --now "${SERVICE_NAME}.service" 2>/dev/null || true
  fi
  rm -f "${UNIT_PATH}"
  systemctl daemon-reload
  echo "已卸载 ${SERVICE_NAME}.service"
}

write_unit() {
  cat >"${UNIT_PATH}" <<EOF
[Unit]
Description=gbnt backend API
Documentation=file://${APP_DIR}/README.md
After=network-online.target mysql.service mysqld.service mariadb.service
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${APP_DIR}
Environment=GBNT_CONFIG=${CONFIG}
ExecStart=${BIN}
Restart=always
RestartSec=3
TimeoutStopSec=20
KillMode=mixed
LimitNOFILE=65535
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
}

install_svc() {
  need_root

  if [[ ! -d "${APP_DIR}" ]]; then
    echo "APP_DIR 不存在: ${APP_DIR}" >&2
    exit 1
  fi
  if [[ ! -f "${CONFIG}" ]]; then
    echo "配置文件不存在: ${CONFIG}" >&2
    echo "请先准备 configs/config.yaml，或设置 CONFIG=绝对路径" >&2
    exit 1
  fi
  if [[ ! -x "${BIN}" ]]; then
    echo "可执行文件不存在或不可执行: ${BIN}" >&2
    echo "请先在 ${APP_DIR} 编译，例如：" >&2
    echo "  cd ${APP_DIR} && go build -o gbnt.service ./cmd/server && chmod +x gbnt.service" >&2
    echo "或设置 BIN=二进制绝对路径" >&2
    exit 1
  fi

  if ! getent group "${RUN_GROUP}" >/dev/null; then
    groupadd --system "${RUN_GROUP}"
  fi
  if ! id -u "${RUN_USER}" >/dev/null 2>&1; then
    useradd --system --gid "${RUN_GROUP}" --home-dir "${APP_DIR}" \
      --shell /usr/sbin/nologin --comment "gbnt backend" "${RUN_USER}"
  fi

  mkdir -p "${APP_DIR}/logs" "${APP_DIR}/storage/uploads"
  chown -R "${RUN_USER}:${RUN_GROUP}" "${APP_DIR}/logs" "${APP_DIR}/storage"
  # 相对路径配置/附件依赖工作目录可读
  chmod 755 "${APP_DIR}"
  chown "${RUN_USER}:${RUN_GROUP}" "${BIN}"
  chmod 755 "${BIN}"

  write_unit
  chmod 644 "${UNIT_PATH}"
  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  systemctl --no-pager --full status "${SERVICE_NAME}.service" || true
  echo
  echo "已注册并启动 ${SERVICE_NAME}"
  echo "  单元: ${UNIT_PATH}"
  echo "  目录: ${APP_DIR}"
  echo "  配置: ${CONFIG}"
  echo "  二进制: ${BIN}"
  echo "  用户: ${RUN_USER}"
  echo "常用命令: systemctl status|restart|stop ${SERVICE_NAME} ; journalctl -u ${SERVICE_NAME} -f"
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
    echo "环境变量: APP_DIR BIN CONFIG RUN_USER RUN_GROUP SERVICE_NAME" >&2
    exit 1
    ;;
esac
