# 部署资产

- `systemd/`：API 服务安装与定时拉取重建。
- `nginx/`：同域分流示例（页面 dist、`/api` 反代、`/uploads` 读盘）。
- `mysql/`：MySQL Community 安装与备份脚本。

手册：

- [Linux 同域部署](../docs/operations/linux-deploy.md)
- [Nginx 同域分流](../docs/operations/nginx.md)
- [MySQL 安装与备份](../docs/operations/linux-mysql.md)

脚本默认按当前 monorepo 结构定位 `apps/server/`；部署到其它目录时应显式传入脚本支持的路径环境变量。
