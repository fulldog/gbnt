#!/usr/bin/env bash
# 安装 Oracle MySQL 8 Community（免费 GPL，不是 Enterprise，也不是 MariaDB）。
# 用法：sudo MYSQL_ROOT_PASSWORD='强密码' ./install-mysql8.sh
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
MYSQL_BIND="${MYSQL_BIND:-127.0.0.1}"
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

install_deb() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y wget gnupg lsb-release ca-certificates
  mkdir -p /etc/apt/keyrings
  wget -qO- https://repo.mysql.com/RPM-GPG-KEY-mysql-2022 > /tmp/mysql-gpg-2022
  wget -qO- https://repo.mysql.com/RPM-GPG-KEY-mysql-2023 > /tmp/mysql-gpg-2023
  cat /tmp/mysql-gpg-2022 /tmp/mysql-gpg-2023 | gpg --dearmor -o /etc/apt/keyrings/mysql.gpg
  chmod 644 /etc/apt/keyrings/mysql.gpg
  rm -f /tmp/mysql-gpg-2022 /tmp/mysql-gpg-2023

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
    dnf -y install "https://dev.mysql.com/get/mysql80-community-release-el${major}-1.noarch.rpm" \
      || dnf -y install "https://repo.mysql.com/mysql80-community-release-el${major}-1.noarch.rpm"
    dnf -y install mysql-community-server mysql-community-client
  else
    yum -y install wget ca-certificates
    yum -y install "https://dev.mysql.com/get/mysql80-community-release-el${major}-1.noarch.rpm"
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

SQL="ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;"

run_sql() {
  mysql --protocol=socket -uroot -e "${SQL}" \
    || mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "${SQL}" \
    || mysql -h127.0.0.1 -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "${SQL}"
}

if ! run_sql; then
  echo "设置 root 密码或建库失败。可手动：" >&2
  echo "  sudo mysql -e \"CREATE DATABASE IF NOT EXISTS ${MYSQL_DB} DEFAULT CHARACTER SET utf8mb4;\"" >&2
  exit 1
fi

echo "已安装/配置 MySQL Community 8（免费）。库: ${MYSQL_DB}  bind: ${MYSQL_BIND}"
echo "$(mysqld --version 2>/dev/null || mysql --version)"
echo "应用 DSN 示例: root:***@tcp(127.0.0.1:3306)/${MYSQL_DB}?charset=utf8mb4&parseTime=True&loc=Local"
