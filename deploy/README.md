# 部署资产

- `systemd/`：API 服务安装与定时拉取重建。
- `nginx/`：反向代理示例。
- `mysql/`：MySQL Community 安装与备份脚本。

脚本默认按当前 monorepo 结构定位 `apps/server/`；部署到其它目录时应显式传入脚本支持的路径环境变量。
