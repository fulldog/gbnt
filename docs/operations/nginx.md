# Nginx：同一域名分流

管理后台、API、附件 GET 共用一个 `server_name`。可安装示例：[`deploy/nginx/weilone.com.conf`](../../deploy/nginx/weilone.com.conf)。部署顺序与验收见 [linux-deploy.md](./linux-deploy.md)。

下文路径以仓库根 `/opt/www/gbnt`、域名 `weilone.com` 为例。

---

## 为什么拆三段

| `location` | 行为 | 原因 |
| --- | --- | --- |
| `/api/` | `proxy_pass` 到 `127.0.0.1:8080` | 鉴权、业务、上传写盘都在 Go。 |
| `/uploads/` | `alias` 到磁盘，**不要** `try_files ... /index.html` | 接口返回的 URL 前缀是 `/uploads/`；生产 GET 不必再进 Go。 |
| `/` | `root` 指向 `apps/admin-web/dist`，`try_files $uri $uri/ /index.html` | Vue History 路由；刷新 `/workbench` 必须回到 `index.html`。 |

不要把整个站点 `proxy_pass` 到 Go：Go 不托管 `dist`，管理后台页面会 404。

`alias` 必须与 `apps/server/configs/config.yaml` 的 `upload.root` **同一绝对路径**。默认相对路径是 `storage/uploads`，相对 systemd 工作目录 `apps/server/`，即：

```text
/opt/www/gbnt/apps/server/storage/uploads/
```

`location /uploads/` 与 `alias` 都要带末尾 `/`，否则路径会拼错。缺文件应 404，不能落到管理后台首页。

上传仍走 `POST /api/...`。若暂时不改 Nginx、继续把 `/uploads/` 反代到 Go，功能可用，只是多占后端。本机 `go run` 无 Nginx 时继续用 Go 的 `r.Static`。

`/uploads/` 当前不校验登录（与 Go 中间件一致）：知道 URL 即可下载。若以后要登录才能看图，不能只靠 `alias`。

`client_max_body_size` 示例为 `100m`，需大于 `upload.max_file_size`。

---

## 安装（Ubuntu/Debian）

```bash
sudo apt-get install -y nginx
sudo cp /opt/www/gbnt/deploy/nginx/weilone.com.conf /etc/nginx/sites-available/weilone.com
# 编辑：server_name、root、alias
sudo ln -sf /etc/nginx/sites-available/weilone.com /etc/nginx/sites-enabled/
# 若存在 default 站点抢 80 端口，按需 disable
sudo nginx -t && sudo systemctl reload nginx
```

RHEL 系通常把文件放到 `/etc/nginx/conf.d/weilone.com.conf`，同样 `nginx -t` 后 reload。

Go 须先监听示例里的 upstream（生产建议 `server.addr: "127.0.0.1:8080"`）。

---

## HTTPS

示例 conf **默认可直接用于 HTTP**，避免没有证书时 `nginx -t` 失败。上 HTTPS 时：

1. 准备证书（Let’s Encrypt、云厂商等）。
2. 增加（或取消注释）`listen 443 ssl` 的 `server`，填 `ssl_certificate` / `ssl_certificate_key`。
3. 80 端口改为 301 到 `https://$host$request_uri`。
4. 小程序若调同一主机，必须是 HTTPS，并在微信公众平台配置合法域名。

证书路径按实际填写，例如：

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name weilone.com www.weilone.com;

    ssl_certificate     /etc/letsencrypt/live/weilone.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/weilone.com/privkey.pem;

    client_max_body_size 100m;
    # 以下 location 与 HTTP server 相同：/api/、/uploads/、/
}
```

80 跳转：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name weilone.com www.weilone.com;
    return 301 https://$host$request_uri;
}
```

---

## 常见问题

- **刷新子路径 404**：`/` 缺少 `try_files $uri $uri/ /index.html`，或 `root` 指错。
- **图片 404**：`alias` 与 `upload.root` 不一致，或目录权限不允许 `nginx` 用户读取（上传目录属主多为 `gbnt`，需组读或 ACL）。
- **接口 502**：`gbnt` 未启动，或 `server.addr` 不是 Nginx 连的那个地址。
- **上传 413**：提高 `client_max_body_size`。
- **页面能开、接口跨域报错**：生产同域应留空 `VITE_API_BASE_URL`，不要把 API 指到另一个 Origin。
