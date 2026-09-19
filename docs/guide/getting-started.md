# 快速开始

## 环境要求

- Node.js 24（本次验收使用 24.15.0）
- pnpm
- PostgreSQL
- Redis

## 安装与配置

```bash
pnpm install
```

复制 `packages/backend/.env.example` 为 `packages/backend/.env.local`，至少填写 PostgreSQL、Redis、`JWT_SECRET` 和 `REFRESH_TOKEN_SECRET`。本地启动脚本会设置 `NODE_ENV=local`，因此优先读取 `.env.local`。

::: warning 不要提交密钥
`.env.local` 已被 Git 忽略。生产环境应由密钥管理系统注入配置，不要沿用示例值。
:::

## 准备数据库

在仓库根目录执行迁移命令；`generate`、`run`、`show`、`revert` 会先构建代码，保证 CLI 读取最新实体和迁移文件：

```bash
pnpm migration:show
pnpm migration:run
```

`1780416958755-initData.ts` 是空迁移，基础表由后续的 `1789459958471-update-table.ts` 创建。实体变更后执行 `pnpm migration:generate`，审查生成的 SQL，再执行 `pnpm migration:run`；部署已有迁移时无需再次生成。生产环境不要启用 `TYPEORM_SYNCHRONIZE`。

`migration:generate` 比较实体与连接数据库中的实际结构，迁移历史表仅用于判断哪些迁移已经执行。`TYPEORM_SCHEMA` 留空或不设置时使用连接默认 schema（通常为 `public`）；指定 schema 时应与现有表所在位置一致。不要为了消除重复建表而随意切换到新 schema。

若生成结果包含已有表的 `CREATE TABLE`，先检查连接目标、schema 和构建产物；不要执行重复全量迁移或删除已执行的迁移记录。数据库与实体一致时，TypeORM 提示没有结构变化且不创建文件（普通 generate 返回退出码 1）。

### 生成后的安全升级审查

本项目在 `.agents/skills/atlas/SKILL.md` 接入了基于 [Atlas Agent Skills](https://atlasgo.io/guides/ai-tools/agent-skills) 的项目工作流。由 Agent 处理迁移任务时，生成后需继续审查和修正 SQL、在隔离 PostgreSQL 中验证旧数据升级及回滚，并说明锁、表重写和新旧应用兼容性。已有生成文件可直接交给 Agent 审查，无需重新生成。

普通终端执行 `pnpm migration:generate` 仍只生成 TypeORM 候选迁移，不会自动调用 AI 或保证上线安全。尤其要检查同一列的 `DROP COLUMN` + `ADD`、无回填的 `NOT NULL`、有损类型转换，以及大表索引/锁操作。时间转换必须明确历史时区，不能仅依据当前连接为 UTC 推断。

#### 团队统一使用方式

团队统一使用以下入口和验收标准。本节为使用方式的维护入口；Agent 执行细则以 `.agents/skills/atlas/SKILL.md` 为准。提示词发送给在本仓库工作的 Agent，不粘贴到终端执行。

**入口一：实体已修改，尚未生成迁移。** 复制以下提示词，替换尖括号中的信息：

```text
使用本项目 .agents/skills/atlas/SKILL.md，完成本次数据库迁移。
实体变更：<简述本次变更>
历史时间语义：<UTC / 其他已确认时区 / 不确定 / 不涉及>

先确认连接目标、schema 和迁移基线，关闭 synchronize 和 migrationsRun。
在 packages/backend 执行 pnpm migration:generate，然后继续审查和修正生成文件。
保留已有数据，检查 up/down、约束、索引、锁及新旧应用兼容性。
在隔离 PostgreSQL 中用代表性旧数据验证升级、回滚或前向恢复，检查最终结构与实体一致。
交付迁移文件、验证结果、上线步骤、恢复方案及未验证项，不执行生产迁移。
信息不足时先完成不受影响的工作，不猜测历史数据含义，不把跳过验证当作通过。
```

**入口二：已经生成迁移，或执行失败后已回滚。** 复制以下提示词并填写真实状态：

```text
使用本项目 .agents/skills/atlas/SKILL.md，审查并修正已有迁移。
迁移文件：packages/backend/src/migrations/<实际文件名>.ts
执行状态：<未执行 / 执行失败且已回滚 / 已执行 / 不确定>
历史时间语义：<UTC / 其他已确认时区 / 不确定 / 不涉及>
失败日志：<有则提供，移除凭据>

不要重复 migration:generate；先核实执行状态，已应用文件保持不变，必要时新增纠正迁移。
保留已有数据，检查 up/down、约束、索引、锁及新旧应用兼容性。
在隔离 PostgreSQL 中用代表性旧数据验证升级、回滚或前向恢复，检查最终结构与实体一致。
交付迁移文件、验证结果、上线步骤、恢复方案及未验证项，不执行生产迁移。
信息不足时先完成不受影响的工作，不猜测历史数据含义，不把跳过验证当作通过。
```

两种入口采用相同交付标准：

| 交付项 | 必须说明的内容 |
| --- | --- |
| 迁移改动 | 文件路径、修改原因、执行状态依据、数据保留与时间转换语义 |
| 验证结果 | 隔离库版本和基线、旧数据样本、升级/恢复结果、实体结构差异；逐项区分通过、失败、未执行 |
| Atlas 检查 | 是否实际执行 lint，以及未执行的原因；不能用编译成功代替数据验证 |
| 上线与恢复 | 应用/数据库发布顺序、锁及重写影响、维护窗口或分阶段方案、超时预算、备份与恢复步骤 |
| 剩余条件 | 缺失信息、生产规模演练等未完成事项，以及是否具备部署条件 |

收到结果后按交付的发布步骤评审和部署，不在生成后直接执行 `migration:run`。仅有“已生成”“构建通过”或“空库执行成功”不满足上述验收标准。

Atlas CLI 及其许可独立安装/配置；当前官方 `migrate lint` 需要 Pro 授权。TypeORM 的 `.ts` 迁移不能直接传给 Atlas SQL lint，需准备完整基线和候选 SQL 验证副本。Atlas 不可用时记录未执行，继续隔离库数据验证，不把跳过当作通过。生产执行仍由部署流程负责；当前 pnpm TypeORM 脚本固定读取 local 环境。

`1789648814246-update-table.ts` 按已确认的 UTC 历史语义原地转换时间列，并保留已有索引。其带数据往返测试为 `packages/backend/test/migration-timezone.integration.mjs`，构建后通过 `MIGRATION_TEST_DATABASE_URL` 指向本次新建的本地 `atlas_migration_test` 空数据库，再执行 `node --test test/migration-timezone.integration.mjs`（工作目录为 core）。测试使用事务并最终回滚，不接受日常数据库名称。

该迁移仍需排他锁，不能直接视为零停机方案。部署前确认目标尚未执行此迁移、历史值确为 UTC、备份可恢复，并在生产规模副本测量耗时；为迁移连接配置明确的锁等待/语句超时预算。暂停受影响写入并在维护窗口执行，完成后验证结构、数据和应用读写再恢复服务。若业务不能接受窗口，应拆成新列、兼容读写、分批回填和切换的分阶段发布。回滚使用相同 UTC 语义，回滚应用与数据库需保持兼容；不要在业务已依赖新模型后直接执行 revert。

## 初始化基础数据与超级管理员

初始化脚本要求数据库表已经存在。每次运行都会事务化补齐根部门、`user` 默认角色和系统管理菜单/权限，再检查是否已有 `code=super` 的用户；已有超级用户时保留账号和密钥，跳过账号创建。已关联但被禁用的管理员也会阻止重复创建；软删除的用户、角色和关联不计入账号检查。已有 `super` 角色若被禁用或软删除，需要先恢复并启用。

基础菜单为“系统管理 → 部门管理、菜单管理、角色管理、用户管理”，每页登记本项目的 `system:<模块>:list/create/update/delete` 权限；附件 `list/read/delete` 和上传策略 `read/write` 统一挂在“系统管理 → 附件管理”二级目录下，以权限按钮登记。目录为 `SystemAttachment`（`catalog`，路径 `/system/attachment`），用于菜单与角色授权树分组；当前未提供附件前端页面组件，目录本身不代表已交付可操作页面。`super` 沿用已有全权限逻辑；`user` 为受保护普通角色，不授予管理菜单或 `system:*` 权限。重跑会清理该角色已有的管理授权，保留其业务权限与其他角色的人工授权；若用户还有其他管理角色，仍可能通过其他角色获得管理权限。用户创建仍须显式传入 `roleIds`，`isDefault` 不意味着自动分配。

已有启用根部门时复用，否则创建 `pid=null` 的“根部门”；首次创建的超级用户归属该部门，已有用户部门不调整。重复执行保留菜单标题、排序等自定义元数据。旧版直接挂在 System 下的五项附件/上传策略种子权限会原地调整到附件管理，保留权限 ID 与角色关联；人工调整到其他父级的记录仍按冲突处理。停用、软删除、菜单标识/路径/权限/组件冲突或存在其他默认角色时明确报错并回滚基础数据事务，不自动恢复或覆盖。基础数据与账号创建为两个事务，账号未创建时下次可继续。

在停止应用的维护窗口运行 setup，避免并发授权写入和旧权限缓存重填。数据库提交后会定向删除 super/user 关联用户的权限缓存；已有这些用户时 Redis 必须可用。缓存清理失败会报错，保持服务停止，恢复 Redis 后重跑即可；不清空 Redis 或修改其他用户会话。

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

本项目通过显式导入并注册 `@fastify/static` 提供静态资源，规避当前 Nest 12 `useStaticAssets()` 传递模块命名空间导致启动挂起的问题。保留 `/uploads` 访问限制。静态目录固定为 `packages/backend/public`（部署时为应用根目录下的 `public`），与 `dist` 同级，不随构建清理；无需配置，首次启动自动创建。入口为 `src/main.ts`、`dist/main.js` 或 `dist/src/main.js` 时均定位到同一目录，不使用启动工作目录兜底。输出布局由 TypeScript/CLI 配置决定，当前 `rootDir: "./"` 对应 `dist/src/main.js`，本地 watch 同样运行编译产物。系统附件仍由上传模块在 `var/attachments` 下按需创建，不能放进公开静态目录。

## 启动文档站

```bash
pnpm docs:dev
```

生产构建与本地预览：

```bash
pnpm docs:build
pnpm docs:preview
```

## 根目录常用命令

全部后端命令自动在 `packages/backend` 执行；环境文件仍放在该目录。

| 命令 | 用途 |
| --- | --- |
| `pnpm start:local` | 本地监听，读取 `.env.local` |
| `pnpm start:dev` | 开发监听，读取 `.env.development` |
| `pnpm build` | 构建后端 |
| `pnpm start:prod` | production 模式运行 `dist/src/main.js` |
| `pnpm setup` | 补齐基础数据并交互初始化管理员 |
| `pnpm test` / `pnpm typecheck` | 单元测试 / 类型检查 |
| `pnpm lint:check` / `pnpm lint` | 只读 ESLint 检查 / 自动修复 |
| `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` | 文档开发 / 构建 / 预览 |

完整命令和用途见[项目 README](https://github.com/kumvjs/KuVibeAdmin#根目录常用命令)，独立数据库测试见[发布验收](release-verification.md)。生产启动要求 HTTPS 公开地址、精确 Origin 白名单和安全 Cookie；迁移脚本仍固定使用 local 配置，上线执行方式必须经部署审查。
