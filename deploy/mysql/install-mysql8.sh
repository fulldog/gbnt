#!/usr/bin/env bash
# 安装 Oracle MySQL 8 Community（免费 GPL，不是 Enterprise，也不是 MariaDB）。
# 用法：
#   sudo MYSQL_ROOT_PASSWORD='root强密码' MYSQL_APP_PASSWORD='应用账号密码' ./install-mysql8.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 执行：sudo MYSQL_ROOT_PASSWORD='...' $0" >&2
  exit 1
fi

if [[ -z "${MYSQL_ROOT_PASSWORD:-}" ]]; then
  echo "请设置 MYSQL_ROOT_PASSWORD" >&2
  exit 1
fi
if [[ "${MYSQL_ROOT_PASSWORD}" == *"'"* ]]; then
  echo "MYSQL_ROOT_PASSWORD 不能包含单引号" >&2
  exit 1
fi

MYSQL_DB="${MYSQL_DB:-gbnt}"
MYSQL_APP_USER="${MYSQL_APP_USER:-gbnt}"
MYSQL_APP_PASSWORD="${MYSQL_APP_PASSWORD:-${MYSQL_ROOT_PASSWORD}}"
if [[ "${MYSQL_APP_PASSWORD}" == *"'"* ]]; then
  echo "MYSQL_APP_PASSWORD 不能包含单引号" >&2
  exit 1
fi
# 应用账号允许远程时必须监听非 loopback；未显式指定则改为 0.0.0.0
MYSQL_BIND="${MYSQL_BIND:-0.0.0.0}"
# Community 8.0；仓库没有时脚本会再试 8.4 LTS（同属免费社区版）
MYSQL_SERIES="${MYSQL_SERIES:-8.0}"

. /etc/os-release
ID_LIKE="${ID_LIKE:-}"

is_mariadb() {
  mysql --version 2>/dev/null | grep -qi mariadb && return 0
  mysqld --version 2>/dev/null | grep -qi mariadb && return 0
  return 1
}

is_mysql8_community() {
  local v
  v="$(mysqld --version 2>/dev/null || mysql --version 2>/dev/null || true)"
  echo "${v}" | grep -qi mariadb && return 1
  echo "${v}" | grep -qE 'Ver 8\.' && return 0
  return 1
}

# Oracle 轮换过仓库签名钥；8.0.46+ 需 2025 钥，旧仓库包只带 5072E1F5。
MYSQL_GPG_KEYS=(
  https://repo.mysql.com/RPM-GPG-KEY-mysql-2022
  https://repo.mysql.com/RPM-GPG-KEY-mysql-2023
  https://repo.mysql.com/RPM-GPG-KEY-mysql-2025
)

import_mysql_gpg_files() {
  local dest="$1"
  : >"${dest}"
  local url
  for url in "${MYSQL_GPG_KEYS[@]}"; do
    wget -qO- "${url}" >>"${dest}"
  done
}

install_deb() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y wget gnupg lsb-release ca-certificates
  mkdir -p /etc/apt/keyrings
  import_mysql_gpg_files /tmp/mysql-gpg-all
  gpg --dearmor -o /etc/apt/keyrings/mysql.gpg </tmp/mysql-gpg-all
  chmod 644 /etc/apt/keyrings/mysql.gpg
  rm -f /tmp/mysql-gpg-all

  local dist="ubuntu"
  [[ "${ID}" == "debian" ]] && dist="debian"
  local code
  code="$(lsb_release -sc)"

  write_list() {
    local series="$1"
    cat >/etc/apt/sources.list.d/mysql-community.list <<EOF
deb [signed-by=/etc/apt/keyrings/mysql.gpg] http://repo.mysql.com/apt/${dist} ${code} mysql-apt-config
deb [signed-by=/etc/apt/keyrings/mysql.gpg] http://repo.mysql.com/apt/${dist} ${code} mysql-${series}
deb [signed-by=/etc/apt/keyrings/mysql.gpg] http://repo.mysql.com/apt/${dist} ${code} mysql-tools
EOF
  }

  write_list "${MYSQL_SERIES}"
  if ! apt-get update -y; then
    echo "仓库 mysql-${MYSQL_SERIES} 不可用，改试 mysql-8.4-lts（仍是免费 Community）"
    MYSQL_SERIES="8.4-lts"
    write_list "${MYSQL_SERIES}"
    apt-get update -y
  fi

  apt-get install -y mysql-community-server mysql-community-client
}

install_rpm() {
  local major=""
  case "${VERSION_ID:-}" in
    7*) major=7 ;;
    8*) major=8 ;;
    9*) major=9 ;;
    10*) major=10 ;;
    *)
      major="$(rpm -E '%{rhel}' 2>/dev/null || true)"
      [[ "${major}" == "%{rhel}" || -z "${major}" ]] && major=9
      ;;
  esac

  if command -v dnf >/dev/null; then
    dnf -y install wget ca-certificates
    dnf -y module disable mysql mariadb 2>/dev/null || true
  else
    yum -y install wget ca-certificates
  fi

  local keydir="/etc/pki/rpm-gpg"
  mkdir -p "${keydir}"
  local url f
  for url in "${MYSQL_GPG_KEYS[@]}"; do
    f="${keydir}/$(basename "${url}")"
    wget -qO "${f}" "${url}"
    rpm --import "${f}"
  done

  if command -v dnf >/dev/null; then
    dnf -y install "https://dev.mysql.com/get/mysql80-community-release-el${major}-1.noarch.rpm" \
      || dnf -y install "https://repo.mysql.com/mysql80-community-release-el${major}-1.noarch.rpm"
  else
    yum -y install "https://dev.mysql.com/get/mysql80-community-release-el${major}-1.noarch.rpm"
  fi

  # 旧版 mysql80-community-release 只写 RPM-GPG-KEY-mysql，补上新钥路径。
  local repo
  for repo in /etc/yum.repos.d/mysql-community.repo /etc/yum.repos.d/mysql-community-source.repo; do
    [[ -f "${repo}" ]] || continue
    if grep -q 'RPM-GPG-KEY-mysql-2025' "${repo}"; then
      continue
    fi
    sed -i 's|^gpgkey=.*|gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql-2025\n       file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql-2023\n       file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql-2022\n       file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql|' "${repo}"
  done

  if command -v dnf >/dev/null; then
    dnf -y install mysql-community-server mysql-community-client
  else
    yum -y install mysql-community-server mysql-community-client
  fi
}

if is_mariadb; then
  echo "检测到 MariaDB。它不是免费版 MySQL 8。" >&2
  echo "请先卸载 MariaDB（例如 apt remove --purge mariadb-server 或 dnf remove mariadb-server），再运行本脚本。" >&2
  echo "本脚本安装的是 Oracle MySQL Community Server 8（GPL 免费，包名 mysql-community-server）。" >&2
  exit 1
fi

if is_mysql8_community; then
  echo "已是 MySQL 8，跳过软件包安装: $(mysqld --version 2>/dev/null || mysql --version)"
else
  case "${ID}" in
    ubuntu|debian)
      install_deb
      ;;
    centos|rhel|rocky|almalinux|fedora|ol|amzn)
      install_rpm
      ;;
    *)
      if echo "${ID_LIKE}" | grep -qi debian; then
        install_deb
      elif echo "${ID_LIKE}" | grep -qiE 'rhel|fedora'; then
        install_rpm
      else
        echo "未识别发行版 ${ID}，请手动安装 mysql-community-server 8 后重跑" >&2
        exit 1
      fi
      ;;
  esac
fi

if is_mariadb; then
  echo "安装结果仍是 MariaDB，未装上 Community MySQL 8" >&2
  exit 1
fi
if ! is_mysql8_community; then
  echo "未检测到 MySQL 8。当前: $(mysqld --version 2>/dev/null || mysql --version 2>/dev/null || echo none)" >&2
  exit 1
fi

DROPIN="/etc/mysql/mysql.conf.d/99-gbnt.cnf"
if [[ ! -d "/etc/mysql/mysql.conf.d" ]]; then
  DROPIN="/etc/my.cnf.d/99-gbnt.cnf"
fi
mkdir -p "$(dirname "${DROPIN}")"

systemctl enable --now mysqld 2>/dev/null || systemctl enable --now mysql

cat >"${DROPIN}" <<EOF
# gbnt：utf8mb4 + binlog（增量备份）
[mysqld]
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
bind-address=${MYSQL_BIND}
port=3306
server-id=1
log_bin=mysql-bin
binlog_format=ROW
binlog_expire_logs_seconds=604800
max_binlog_size=256M
skip_name_resolve=ON

[client]
default-character-set=utf8mb4
EOF

systemctl restart mysqld 2>/dev/null || systemctl restart mysql

# Community MySQL 8 首次初始化会把临时 root 密码写进错误日志，空密码无法登录。
find_temp_root_password() {
  local f
  for f in /var/log/mysqld.log /var/log/mysql/error.log /var/log/mysql/mysqld.log; do
    [[ -f "${f}" ]] || continue
    # 取最后一次生成的临时密码（重装/多次启动时日志可能有多条）
    grep -oE 'temporary password is generated for root@localhost:[[:space:]]*[^[:space:]]+' "${f}" \
      | tail -n1 \
      | sed -E 's/.*temporary password is generated for root@localhost:[[:space:]]*//' \
      && return 0
  done
  return 1
}

SQL="ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
ALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'localhost' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
ALTER USER '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
ALTER USER '${MYSQL_APP_USER}'@'localhost' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
ALTER USER '${MYSQL_APP_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_APP_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_APP_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_APP_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;"

# 用指定密码尝试执行初始化 SQL；失败返回非 0。
try_sql_with_password() {
  local pass="$1"
  if [[ -z "${pass}" ]]; then
    mysql --protocol=socket -uroot --connect-expired-password -e "${SQL}"
  else
    mysql --protocol=socket -uroot -p"${pass}" --connect-expired-password -e "${SQL}"
  fi
}

run_sql() {
  # 1) 已是目标密码（重跑脚本）
  try_sql_with_password "${MYSQL_ROOT_PASSWORD}" && return 0
  # 2) 无密码（极少数发行版）
  try_sql_with_password "" && return 0
  # 3) 错误日志里的临时密码（EL/RHEL Community 默认路径）
  local temp_pass=""
  if temp_pass="$(find_temp_root_password)"; then
    echo "使用错误日志中的临时 root 密码完成初始化…"
    try_sql_with_password "${temp_pass}" && return 0
  fi
  return 1
}

if ! run_sql; then
  echo "设置 root 密码或建库失败。Community MySQL 8 首次安装需用临时密码登录。" >&2
  echo "可手动：" >&2
  echo "  sudo grep 'temporary password' /var/log/mysqld.log" >&2
  echo "  mysql -uroot -p'临时密码' --connect-expired-password" >&2
  echo "  然后执行：ALTER USER 'root'@'localhost' IDENTIFIED BY '你的密码';" >&2
  echo "  CREATE DATABASE IF NOT EXISTS ${MYSQL_DB} DEFAULT CHARACTER SET utf8mb4;" >&2
  exit 1
fi

echo "已安装/配置 MySQL Community 8（免费）。库: ${MYSQL_DB}  bind: ${MYSQL_BIND}"
echo "应用账号: ${MYSQL_APP_USER}（${MYSQL_DB}.* 全部权限，允许远程 %）"
echo "$(mysqld --version 2>/dev/null || mysql --version)"
echo "本机 DSN: ${MYSQL_APP_USER}:***@tcp(127.0.0.1:3306)/${MYSQL_DB}?charset=utf8mb4&parseTime=True&loc=Local"
echo "远程 DSN: ${MYSQL_APP_USER}:***@tcp(服务器IP:3306)/${MYSQL_DB}?charset=utf8mb4&parseTime=True&loc=Local"
echo "远程还需放行防火墙 3306，例如: firewall-cmd --permanent --add-port=3306/tcp && firewall-cmd --reload"
