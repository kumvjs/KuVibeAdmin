# 快速开始

## 环境要求

- Node.js 20 或更高版本（建议使用当前 LTS）
- pnpm
- PostgreSQL
- Redis

## 安装与配置

```bash
pnpm install
```

复制 `.env.example` 为 `.env.local`，至少填写 PostgreSQL、Redis、`JWT_SECRET` 和 `REFRESH_TOKEN_SECRET`。本地启动脚本会设置 `NODE_ENV=local`，因此优先读取 `.env.local`。

::: warning 不要提交密钥
`.env.local` 已被 Git 忽略。生产环境应由密钥管理系统注入配置，不要沿用示例值。
:::

## 准备数据库

在 `packages/core` 目录执行迁移命令；`generate`、`run`、`show`、`revert` 会先构建代码，保证 CLI 读取最新实体和迁移文件：

```bash
cd packages/core
pnpm migration:show
pnpm migration:run
```

`1780416958755-initData.ts` 是空迁移，基础表由后续的 `1789459958471-update-table.ts` 创建。实体变更后执行 `pnpm migration:generate`，审查生成的 SQL，再执行 `pnpm migration:run`；部署已有迁移时无需再次生成。生产环境不要启用 `TYPEORM_SYNCHRONIZE`。

`migration:generate` 比较实体与连接数据库中的实际结构，迁移历史表仅用于判断哪些迁移已经执行。`TYPEORM_SCHEMA` 留空或不设置时使用连接默认 schema（通常为 `public`）；指定 schema 时应与现有表所在位置一致。不要为了消除重复建表而随意切换到新 schema。

若生成结果包含已有表的 `CREATE TABLE`，先检查连接目标、schema 和构建产物；不要执行重复全量迁移或删除已执行的迁移记录。数据库与实体一致时，TypeORM 提示没有结构变化且不创建文件（普通 generate 返回退出码 1）。

## 初始化超级管理员

初始化脚本要求数据库表已经存在。它会先通过用户与角色的关联检查是否已有 `code=super` 的用户；若存在则提示并结束，不创建用户或修改密钥。已关联但被禁用的管理员也会阻止重复初始化；软删除的用户、角色和关联不计入检查。已有 `super` 角色若被禁用或软删除，需要先恢复并启用。

首次初始化时，按提示输入 5–100 位用户名（如 `admin`）和 6–128 位密码。长度不符、用户名已占用或两次密码不一致时会提示重新输入。脚本只为 `.env.local` 和进程环境中均缺失或为空的 `JWT_SECRET`、`REFRESH_TOKEN_SECRET` 生成密钥，保留已有值；示例占位值也不会自动替换，应在初始化前清空或配置正式密钥。

```bash
pnpm setup
```

## 启动

```bash
# 本地环境，读取 .env.local
pnpm start:local

# 开发环境，读取 .env.development（不存在时回退 .env）
pnpm start:dev

# 构建后运行
pnpm build
pnpm start:prod
```

按示例配置，服务地址为 `http://localhost:7001`，业务 API 默认位于 `/api`。若启用 Swagger，界面默认位于 `http://localhost:7001/api-docs`。

启动完成应看到 `Server running on http://127.0.0.1:7001`（端口由 `APP_PORT` 决定）。`Nest application successfully started` 仅表示 Nest 初始化完成，不能单独作为端口可访问的依据。可访问 `/api-docs`（启用 Swagger 时）验证 HTTP 服务；非生产环境启用 Playground 时也可请求 `/api/status`。

本项目通过显式导入并注册 `@fastify/static` 提供静态资源，规避当前 Nest 12 `useStaticAssets()` 传递模块命名空间导致启动挂起的问题。保留静态根目录检查及 `/uploads` 访问限制。

## 启动文档站

```bash
pnpm docs:dev
```

生产构建与本地预览：

```bash
pnpm docs:build
pnpm docs:preview
```
