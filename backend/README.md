# 高标农田专项整治 · 后台服务

技术栈：Go 1.27 · Gin + Zap + MySQL + JWT + GORM  
工程规范：见 `.cursor/skills/golang-backend/SKILL.md`

## 快速启动

```bash
# 1. 准备 MySQL，修改 configs/config.yaml 或环境变量
# 2. 若 proxy.golang.org 超时：go env -w GOPROXY=https://goproxy.cn,direct
# 3. 进入目录
cd backend
go mod tidy
go run ./cmd/server
```

默认监听 `:8080`。健康检查：`GET /api/health`

默认管理员：`admin` / `admin`（种子：超级管理员，`is_super_admin=true`，org/role=0；生产务必修改）。

## 目录

| 路径 | 说明 |
| --- | --- |
| `cmd/server` | 入口 |
| `configs` | 配置 |
| `internal` | 业务与基建 |
| `pkg` | 可复用工具 |
| `storage/uploads` | 附件本地存储 |
| `logs` | 五类日志 |
| `scripts/install-systemd.sh` | Linux systemd 注册脚本 |

## Linux systemd 部署

需 root。脚本会写入 `/etc/systemd/system/gbnt.service`、创建系统用户 `gbnt`（若不存在），并 `enable --now`：开机进入多用户目标后自动启动；进程异常退出约 3 秒后自动拉起。`systemctl stop gbnt` 为手动停止，不会反复拉起。

工作目录为后端目录（相对路径的配置、日志、上传目录依赖此目录）。配置通过环境变量 `GBNT_CONFIG` 传入。

```bash
cd backend
go build -o gbnt ./cmd/server
chmod +x gbnt
sudo bash scripts/install-systemd.sh
```

部署到其它目录时：

```bash
sudo APP_DIR=/opt/gbnt BIN=/opt/gbnt/gbnt CONFIG=/opt/gbnt/configs/config.yaml bash scripts/install-systemd.sh
```

可选环境变量：`SERVICE_NAME`（默认 `gbnt`）、`RUN_USER` / `RUN_GROUP`（默认 `gbnt`）。

```bash
sudo systemctl status gbnt     # 状态
sudo systemctl restart gbnt    # 手动重启
sudo systemctl stop gbnt       # 停止
sudo systemctl start gbnt      # 启动
journalctl -u gbnt -f          # 跟踪日志
sudo bash scripts/install-systemd.sh uninstall   # 禁用并删除单元文件
```

生产请将 `configs/config.yaml` 中 `server.mode` 设为 `release`，并修改数据库密码与 JWT secret。

## 文档与接口

- 项目文档：`../doc/`
- Apifox 导入：`../doc/apifox/openapi.yaml`
