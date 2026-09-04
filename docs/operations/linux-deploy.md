# Linux 同域部署（API + 管理后台）

适用：Ubuntu/Debian 等（需 systemd）。把 **Go API**、**管理后台静态页**、**附件目录** 挂在 **同一个域名** 上：浏览器只访问 Nginx，不直连 8080。

脚本与示例配置在仓库 `deploy/`。服务器上 **仓库根目录** 为 `/opt/www/gbnt`。

小程序（`apps/miniapp`）不是这套静态站。微信侧要单独配置 HTTPS request / uploadFile / downloadFile 合法域名，不能把 `prototypes/static-demo/` 当正式前端发布。

---

## 拓扑

```text
浏览器
  ├── 页面、JS/CSS     → Nginx → apps/admin-web/dist
  ├── /api/...         → Nginx → 127.0.0.1:8080（Go）
  └── GET /uploads/... → Nginx → apps/server/storage/uploads（与 upload.root 相同）
```

上传（`POST /api/...`）仍由 Go 写盘、打水印、入库。Go 里的 `r.Static("/uploads")` 给本机无 Nginx 时用；生产 GET 由 Nginx 读盘即可。

Nginx 分流细节见 [nginx.md](./nginx.md)。

---

## 1. MySQL

按 [linux-mysql.md](./linux-mysql.md) 安装 MySQL 8 与备份。应用 DSN 写进 `apps/server/configs/config.yaml` 的 `mysql.dsn`。

---

## 2. 后端（systemd）

完整命令与排障见 [apps/server/README.md](../../apps/server/README.md)。仓库根执行：

```bash
cd /opt/www/gbnt
cp apps/server/configs/config.example.yaml apps/server/configs/config.yaml
# 编辑 config.yaml（见下一节）
sudo bash deploy/systemd/install-systemd.sh
sudo systemctl status gbnt
```

健康检查（本机）：

```bash
curl -sS http://127.0.0.1:8080/api/health
```

可选：`sudo bash deploy/systemd/git-pull-rebuild.sh install` 每 5 分钟 `git pull`。HEAD 有变化时：触及 `apps/server/` 则 `go build` 并重启 `gbnt`；触及 `apps/admin-web/`、`packages/` 或锁文件则在仓库根 `pnpm install --frozen-lockfile` 并 `pnpm --filter @gbnt/admin-web build`（产物 `apps/admin-web/dist`）。`RUN_USER` 需能执行 `go`，打包前端还需 `pnpm` 或带 `corepack` 的 Node。`BUILD_ADMIN=0` 可关掉前端打包。已安装过定时器的机器需 **重新执行 install** 才会写入更长超时和新环境变量。

从旧 `backend/` 目录迁过来时，须重跑安装脚本或显式传入新的 `APP_DIR`、`BIN`、`CONFIG`，否则 unit 仍指向旧工作目录。

---

## 3. 生产 `config.yaml`

至少确认：

| 项 | 建议 |
| --- | --- |
| `server.mode` | `release`。`debug` / `dev` 可能重建开发库，生产不要开。 |
| `server.addr` | `"127.0.0.1:8080"`，只让本机 Nginx 连。示例配置里的 `:8080` 会监听所有网卡。 |
| `mysql.dsn` | 生产账号与密码，不要用文档占位符。 |
| `jwt.secret` | 换成足够长的随机串。 |
| `migrate.enabled` / `seed` | 按环境；空库首次可开迁移与种子，稳定后可关。 |
| `upload.root` | 默认相对路径 `storage/uploads`，相对 **systemd 工作目录**（`apps/server/`）。Nginx `alias` 必须指向同一绝对路径。 |
| `cors.enabled` | 同域部署可 `false`。仅当前端 Origin 与 API 不同时才开，并收紧 `allow_origins`。 |

默认管理员种子为 `admin` / `admin`，生产务必改密。

图片水印需要中文字体，否则上传可能报 `watermark: no cjk font found`：

```bash
# Debian/Ubuntu
sudo apt-get install -y fonts-wqy-zenhei fonts-noto-cjk
# CentOS/Rocky/Alma
sudo dnf install -y wqy-zenhei-fonts google-noto-sans-cjk-ttc-fonts

fc-list :lang=zh | head
```

路径特殊时在 `upload.font` 写绝对路径后 `systemctl restart gbnt`。

---

## 4. 管理后台静态包

Node 与 pnpm 版本以仓库根 `package.json` 的 `packageManager` 为准（当前 `pnpm@11.25.0`）。在 **仓库根**：

```bash
cd /opt/www/gbnt
pnpm install
pnpm --filter @gbnt/admin-web build
```

产物：`apps/admin-web/dist/`。

同域时 **不要** 设置 `VITE_API_BASE_URL`（或设为空）。请求走同源 `/api` 与 `/uploads`。`VITE_API_PROXY_TARGET` **只影响** `pnpm dev:admin`，打进生产包没有作用。

Nginx `root` 二选一：

1. 直接指向仓库内 `apps/admin-web/dist`（构建完成后 `reload` Nginx 即可）。
2. 把 `dist` 同步到独立目录（如 `/var/www/gbnt-admin`），示例配置里的 `root` 改成该目录。适合构建机与运行机分离。

路由是 History 模式，刷新 `/workbench` 等路径必须由 Nginx `try_files` 回退到 `index.html`（见 Nginx 文档）。

---

## 5. Nginx

1. 安装 `nginx`。
2. 按 [nginx.md](./nginx.md) 修改并安装 [`deploy/nginx/weilone.com.conf`](../../deploy/nginx/weilone.com.conf)：改 `server_name`、`root`、`alias` 为机器真实路径。
3. `sudo nginx -t && sudo systemctl reload nginx`。

HTTPS、证书与 80 跳转见该文档。

---

## 6. 验收

在浏览器或本机（把 `https://weilone.com` 换成实际域名）：

```bash
curl -sS https://weilone.com/api/health
```

- 打开 `/login` 能出管理后台登录页（不是 Go 的 JSON 404）。
- 登录后访问 `/workbench`，**刷新浏览器**仍是后台页，不是 404。
- 上传一张图，返回的 `/uploads/...` URL 能直接打开；文件落在 `upload.root` 对应目录。

---

## 本机开发（不是生产）

```bash
pnpm dev:admin
```

Vite 把同源 `/api`、`/uploads` 代理出去。连本机 Go 时在不提交的 `apps/admin-web/.env.local` 写 `VITE_API_PROXY_TARGET=http://127.0.0.1:8080`，并保持 `VITE_API_BASE_URL` 为空。
