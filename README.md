# KuVibeAdmin

**面向 AI 辅助开发的 NestJS 管理系统后端，为 Vben Admin 提供真实、可验证的业务基础。**

KuVibeAdmin 原名 Nest AI Boot。项目基于 [KuVibe](https://github.com/kumvjs/KuVibe) 工程协议，通过项目上下文、需求分析、验证、文档和工程记录，让你与 AI 在统一约定下持续开发。

复用成熟的后台界面与认证权限，让 AI 专注业务差异。项目采用 NestJS + Vben 的协作方向；**当前正式版仅交付后端，不包含 Vben 前端应用**。前端按固定版本契约独立接入。

## 当前能力

- **认证与会话**：Argon2id 密码、JWT、HttpOnly Refresh Cookie、令牌轮换与重放拒绝、重置密码和停用后撤销会话。
- **权限与系统管理**：用户、角色、部门、动态菜单和按钮权限；事务写入、Redis 权限缓存失效与最后管理员保护。
- **附件管理**：上传策略、私有下载、明确授权的公开图片、业务引用及清理；默认本地存储。
- **时间与时区**：UTC 时间点存储、用户 IANA 展示偏好、显式业务时区工具与夏令时测试。
- **接口与工程规范**：Swagger/OpenAPI、统一响应、参数校验、traceId、固定 Vben 契约与集成验收。
- **扩展基础**：WebSocket 基础设施已提供；AI Agents 编排、工具调用与记忆仍在规划中。

## 技术栈

TypeScript ESM · NestJS 12 · Fastify 5 · PostgreSQL · TypeORM · Redis · pnpm workspace · VitePress。

Vben 兼容基线为 `v5.7.0`，完整 commit 固定在 [upstream.lock.json](contracts/vben/upstream.lock.json)。这不代表对任意 Vben 版本或未经适配的 Mock 前端提供即插即用保证。

## 快速开始

准备 Node.js 24、pnpm、PostgreSQL 和 Redis：

```bash
git clone https://github.com/kumvjs/KuVibeAdmin.git
cd KuVibeAdmin
pnpm install
cp packages/core/.env.example packages/core/.env.local
```

编辑 `packages/core/.env.local`，配置数据库、Redis 和随机的 `JWT_SECRET` / `REFRESH_TOKEN_SECRET`。创建相应数据库及 schema 后，在**仓库根目录**执行：

```bash
pnpm migration:show
pnpm migration:run
pnpm setup
pnpm start:local
```

示例端口为 `7001`，API 前缀为 `/api`，Swagger 为 `http://localhost:7001/api-docs`。不提供默认管理员密码，`setup` 会交互创建管理员。

已有部署升级前必须审查迁移。时间戳迁移 `1789648814246` 以旧值代表 UTC 为前提；其他部署需确认自己的历史语义。生产禁止依赖 `synchronize`，部署要求和恢复方案见[快速开始](docs/guide/getting-started.md)。

## 根目录常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm start:local` | 本地开发，读取 core 的 `.env.local` |
| `pnpm start:dev` / `pnpm start:debug` | 开发监听 / 调试 |
| `pnpm build` / `pnpm start:prod` | 构建 / 生产启动 |
| `pnpm setup` | 交互初始化超级管理员 |
| `pnpm test` | 单元与 HTTP 契约测试 |
| `pnpm typecheck` | 源码及测试类型检查 |
| `pnpm lint:check` / `pnpm lint` | 只读检查 / 自动修复 |
| `pnpm test:release` | 独立 PostgreSQL/Redis 上的完整后端验收 |
| `pnpm migration:generate` / `pnpm migration:show` | 生成迁移 / 查看状态 |
| `pnpm migration:run` / `pnpm migration:revert` | 执行 / 回滚迁移 |
| `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` | 文档开发 / 构建 / 预览 |
| `pnpm vben:contract:check` | 核验固定上游契约 |

集成测试需要专用测试库，不能指向日常或生产数据库。环境与命令见[发布验收](docs/guide/release-verification.md)。

## 与 AI 协作

从自然语言需求开始，Agent 按 `AGENTS.md` 读取项目上下文与相关工作流，实施后验证并维护文档。数据库迁移使用项目 Atlas Skill，继续由 TypeORM 管理执行历史。

团队提示词和交付标准统一见[快速开始：团队统一使用方式](docs/guide/getting-started.md#团队统一使用方式)。KuVibeAdmin 是 [KuVibe](https://github.com/kumvjs/KuVibe) 工程协议在管理系统后端中的实践，感谢 KuVibe 与 [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) 项目。

## 文档与发布

- [项目概览](docs/guide/overview.md) · [配置](docs/guide/configuration.md) · [Vben 接入](docs/frontend/vben.md)
- [认证与 RBAC](docs/modules/auth-rbac.md) · [附件](docs/modules/attachments.md) · [时间与时区](docs/guide/timezone.md)
- [变更记录](CHANGELOG.md) · [GitHub Releases](https://github.com/kumvjs/KuVibeAdmin/releases)

公开接口以运行中的 Swagger/OpenAPI 为准。数据库、Redis 键和 API 地址不因品牌更名自动改变。
