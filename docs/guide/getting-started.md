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

先构建代码，再生成和运行迁移。执行 TypeORM CLI：

```bash
pnpm build
pnpm migration:generate
pnpm migration:run
```

当前仓库中的 `1780416958755-initData.ts` 是空迁移，不能独立创建全部表。首次使用时需要根据实体生成迁移；生产环境不要启用 `TYPEORM_SYNCHRONIZE`。

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

## 启动文档站

```bash
pnpm docs:dev
```

生产构建与本地预览：

```bash
pnpm docs:build
pnpm docs:preview
```
