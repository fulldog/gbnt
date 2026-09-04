# GBNT · 高标准农田专项整改平台

GBNT 是同时包含 Go API、管理后台和 UniApp 小程序的多语言 monorepo。当前 Go API、两个正式前端的 TypeScript API 层与共享 API client 已就位，页面工程仍可按最终产品技术栈继续初始化；历史静态演示已冻结为只读原型。

## 目录

```text
apps/
  server/              Go 后端服务
  admin-web/           管理后台正式前端
  miniapp/             UniApp 小程序正式前端
packages/
  api-client/          两端共享的请求基础设施与公共接口
prototypes/
  static-demo/         只读静态原型
docs/
  api/                 API 说明与 OpenAPI
  architecture/        架构决策
  operations/          运维手册
deploy/
  systemd/             API 服务部署
  nginx/               反向代理配置
  mysql/               MySQL 安装与备份
scripts/                仓库级开发脚本
```

## 后端启动

```bash
cp apps/server/configs/config.example.yaml apps/server/configs/config.yaml
# 修改本地 MySQL DSN 和密钥
make server-run
```

默认监听 `:8080`，健康检查为 `GET /api/health`。注意：`debug` 或 `dev` 模式可能重建开发数据库，使用前请阅读 [API 服务说明](./apps/server/README.md)。

## 常用检查

```bash
make server-test
make server-build
pnpm typecheck
make check
```

## 接口与前端同步

管理端接口使用 `/api/**`，小程序接口使用 `/api/app/**`，附件等公共接口使用 `/api/attachments/**`。后端接口变更必须同时更新正式前端对应的 API 方法和 TypeScript 类型，具体边界见 [AGENTS.md](./AGENTS.md)。

更多资料：

- [API 文档](./docs/api/README.md)
- [仓库目录设计](./docs/architecture/repository-layout.md)
- [Linux 同域部署](./docs/operations/linux-deploy.md)
- [Nginx 同域分流](./docs/operations/nginx.md)
- [MySQL 部署与备份](./docs/operations/linux-mysql.md)
