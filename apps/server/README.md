# 高标农田专项整治 · 后台服务

技术栈：Go 1.27 · Gin + Zap + MySQL + JWT + GORM  
工程规范：见仓库根目录 `.cursor/skills/golang-backend/SKILL.md`

## 快速启动

```bash
# 1. 准备 MySQL，修改 configs/config.yaml 或环境变量
# 2. 若 proxy.golang.org 超时：go env -w GOPROXY=https://goproxy.cn,direct
# 3. 进入目录
cd apps/server
cp configs/config.example.yaml configs/config.yaml
go mod tidy
go run .
```

也可在仓库根执行 `make server-run`。

默认监听 `:8080`。健康检查：`GET /api/health`

默认管理员：`admin` / `admin`（种子：超级管理员，`is_super_admin=true`，org/role=0；生产务必修改）。

## 目录

| 路径 | 说明 |
| --- | --- |
| `main.go` | 入口 |
| `configs` | 配置 |
| `assets/templates` | 随应用发布的导入模板等静态资源 |
| `internal` | 业务与基建 |
| `pkg` | 可复用工具 |
| `storage/uploads` | 附件本地存储 |
| `logs` | 五类日志 |
| `../../deploy/systemd/install-systemd.sh` | Linux systemd 注册常驻服务 |
| `../../deploy/systemd/git-pull-rebuild.sh` | git pull；有更新则编译 API 和/或打包 admin-web；Go 编成功才重启服务 |

## Linux systemd 部署

需 root。脚本会写入 `/etc/systemd/system/gbnt.service`、创建系统用户 `gbnt`（若不存在），并 `enable --now`：开机进入多用户目标后自动启动；进程异常退出约 3 秒后自动拉起。`systemctl stop gbnt` 为手动停止，不会反复拉起。

工作目录为后端目录（相对路径的配置、日志、上传目录依赖此目录）。配置通过环境变量 `GBNT_CONFIG` 传入。

从旧 `backend/` 目录升级时，已经安装的 systemd unit 不会自动更新工作目录；部署新目录后需重新运行安装脚本，或显式传入新的 `APP_DIR`、`BIN` 和 `CONFIG`。

```bash
# 在仓库根目录执行；若还没有二进制，安装脚本会自动 go build
sudo bash deploy/systemd/install-systemd.sh
```

部署到其它目录时：

```bash
sudo APP_DIR=/opt/www/gbnt/apps/server BIN=/opt/www/gbnt/apps/server/gbnt.service CONFIG=/opt/www/gbnt/apps/server/configs/config.yaml bash deploy/systemd/install-systemd.sh
```

可选环境变量：`SERVICE_NAME`（默认 `gbnt`）、`RUN_USER` / `RUN_GROUP`（默认 `gbnt`）。

```bash
sudo systemctl status gbnt     # 状态
sudo systemctl restart gbnt    # 手动重启
sudo systemctl stop gbnt       # 停止
sudo systemctl start gbnt      # 启动
journalctl -u gbnt -f          # 跟踪日志
sudo bash deploy/systemd/install-systemd.sh uninstall   # 禁用并删除单元文件
```

生产请将 `configs/config.yaml` 中 `server.mode` 设为 `release`，并修改数据库密码与 JWT secret。

## 每 5 分钟 git pull 编译重启

与 `install-systemd.sh` 使用同一套路径：`APP_DIR`（默认仓库内 `apps/server`）、二进制 `BIN=$APP_DIR/gbnt.service`、单元名 `SERVICE_NAME=gbnt`。

流程：仓库根 `git pull --ff-only`。HEAD 有变化则按路径决定动作：`apps/server/` → `go build -o "$BIN" .` 并 `systemctl restart gbnt`；`apps/admin-web/`、`packages/`、`pnpm-lock.yaml` 等 → 仓库根 `pnpm install --frozen-lockfile` 与 `pnpm --filter @gbnt/admin-web build`。仅文档等其它文件变化则跳过。Go 编译失败不重启；仅前端变更不重启 API。`BUILD_ADMIN=0` 跳过前端。无更新或构建失败都不重启。

先注册常驻服务，再装定时器（可合并成一次）：

```bash
# 在仓库根目录执行
go -C apps/server build -o gbnt.service .
sudo bash deploy/systemd/install-systemd.sh
sudo bash deploy/systemd/git-pull-rebuild.sh install
```

`RUN_USER` 默认 `gbnt`（与常驻服务一致）。若该用户无法 `git pull`，安装时指定有仓库写权限且已配远程凭证的账号：`sudo RUN_USER=部署用户 bash deploy/systemd/git-pull-rebuild.sh install`。打包管理后台时，该用户还需能执行 `pnpm`（或 `corepack pnpm`）。已经装过旧版定时器的机器必须再跑一次 `install`，才会写入 30 分钟超时和前端相关环境变量。

Git 在属主与执行用户不一致时会拒绝操作（`dubious ownership`）。脚本已对本仓库设置 `safe.directory`。仓库若由 root 克隆，可 `chown -R gbnt:gbnt /opt/www/gbnt`，与 `RUN_USER` 对齐。

```bash
sudo bash deploy/systemd/git-pull-rebuild.sh    # 立刻跑一轮
sudo systemctl start gbnt-pull.service         # 同样立刻跑一轮
systemctl list-timers gbnt-pull.timer
journalctl -u gbnt-pull -f
# 任务日志: apps/server/logs/deploy.log
sudo bash deploy/systemd/git-pull-rebuild.sh uninstall
```

## 上传水印字体（Linux）

图片上传会在左下角绘制中文取证水印，服务器没有中文字体时会报 `watermark: no cjk font found`。先装字体：

```bash
# Debian/Ubuntu
sudo apt-get install -y fonts-wqy-zenhei fonts-noto-cjk
# CentOS/Rocky/Alma
sudo dnf install -y wqy-zenhei-fonts google-noto-sans-cjk-ttc-fonts

fc-list :lang=zh | head        # 确认实际路径
```

装完常见路径可自动探测；路径特殊时在配置里显式指定后重启服务：

```yaml
upload:
  font: "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
```

## MySQL 8 安装与备份

Linux 上安装 MySQL 8、每天凌晨 2 点全量（保留 5 天）、每小时 binlog 增量：见 [`../../docs/operations/linux-mysql.md`](../../docs/operations/linux-mysql.md)，脚本在 `../../deploy/mysql/`。

## 文档与接口

- 项目文档：`../../docs/`
- Apifox 导入：`../../docs/api/apifox/openapi.yaml`
