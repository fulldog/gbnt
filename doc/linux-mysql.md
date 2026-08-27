# Linux 安装 MySQL 8 与备份

适用：Ubuntu/Debian、Rocky/Alma/CentOS 等（需 systemd）。库名默认 `gbnt`，字符集 `utf8mb4`。脚本在 `backend/scripts/mysql/`。

安装的是 **MySQL Community Server 8**（Oracle 官方社区版，GPL **免费**）。不要装 `mysql-commercial-*`（那是付费 Enterprise）。MariaDB 也是免费软件，但是另一个产品，本脚本会拒绝在 MariaDB 上继续。

策略：

| 类型 | 方式 | 周期 | 保留 |
| --- | --- | --- | --- |
| 全量 | `mysqldump` gzip | 每天 **02:00** | **5 天** |
| 增量 | 开启 `log_bin`，每小时 `FLUSH` 并拷贝 binlog | 每小时 | 6 天（覆盖全量窗口） |

恢复：先解压最近一份全量 SQL 导入，再按 dump 头里的 binlog 位点用 `mysqlbinlog` 追加增量文件。

---

## 1. 安装 MySQL 8

```bash
cd backend/scripts/mysql
sudo MYSQL_ROOT_PASSWORD='你的强密码' bash install-mysql8.sh
```

可选：

```bash
# 允许其它机器连库（同时要开防火墙 3306）
sudo MYSQL_ROOT_PASSWORD='...' MYSQL_BIND=0.0.0.0 bash install-mysql8.sh
```

脚本会从 **Oracle 社区版仓库** 安装 `mysql-community-server`（免费 MySQL 8），`enable --now` 服务、写入 utf8mb4 + binlog、创建库 `gbnt`、设置 root 密码。系统源里的 `mysql-server` 在不少发行版会变成 MariaDB，因此不再用系统源。

密码不要包含单引号。装完 `mysqld --version` 应类似 `Ver 8.0.x` / `Ver 8.4.x`，且不含 `MariaDB`。若机器上已有 MariaDB，先卸载再跑脚本。

发行版仓库若没有 8.0，脚本会改装 **8.4 LTS Community**（同样免费）。

应用 DSN：

```text
root:密码@tcp(127.0.0.1:3306)/gbnt?charset=utf8mb4&parseTime=True&loc=Local
```

---

## 2. 注册自动备份

```bash
cd backend/scripts/mysql
sudo cp backup.cnf.example /etc/gbnt-mysql-backup.cnf
sudo nano /etc/gbnt-mysql-backup.cnf    # 填写 root 密码
sudo chmod 600 /etc/gbnt-mysql-backup.cnf
sudo bash install-backup.sh
```

`install-backup.sh` 会把备份脚本拷到 `/usr/local/lib/gbnt-mysql/`，并启用：

- `gbnt-mysql-full.timer`：每天 02:00 全量（错过开机后会补跑 `Persistent=true`）
- `gbnt-mysql-incr.timer`：每小时增量

备份目录默认 `/var/backups/gbnt-mysql/{full,incr}`。

手工立刻跑一次：

```bash
sudo systemctl start gbnt-mysql-full.service
sudo systemctl start gbnt-mysql-incr.service
systemctl list-timers 'gbnt-mysql-*'
journalctl -u gbnt-mysql-full -u gbnt-mysql-incr -n 50
```

全量文件名形如 `full_gbnt_20260827_020000.sql.gz`。超过 5 天的全量会被删除。

---

## 3. 恢复（摘要）

```bash
# 全量
gunzip -c /var/backups/gbnt-mysql/full/full_gbnt_YYYYMMDD_HHMMSS.sql.gz | mysql -uroot -p gbnt

# 看 dump 头 CHANGE REPLICATION SOURCE / CHANGE MASTER 的 binlog 文件与 POS
# 再追加该位点之后的 incr 目录 binlog
mysqlbinlog --start-position=POS mysql-bin.000123 mysql-bin.000124 | mysql -uroot -p
```

先在空库或专用实例演练，不要直接在生产上试第一次恢复。

---

## 4. 卸载备份定时器

```bash
sudo systemctl disable --now gbnt-mysql-full.timer gbnt-mysql-incr.timer
sudo rm -f /etc/systemd/system/gbnt-mysql-full.{service,timer} \
           /etc/systemd/system/gbnt-mysql-incr.{service,timer}
sudo systemctl daemon-reload
```

数据目录与 `/var/backups/gbnt-mysql` 需自行决定是否删除。
