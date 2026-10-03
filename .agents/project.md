# Project Context

<!-- kuvibe: template=project-context revision=1 ownership=project -->

## Product

KuVibeAdmin（原 Nest AI Boot）是基于 KuVibe 工程协议、面向 AI 辅助开发的 NestJS 管理系统后端。后端与仓库内 Vben playground 独立 OpenAPI 生成客户端，已接入真实积分/充值业务，其他前端示例仍独立；AI Agents 业务能力仍在规划。仓库为 https://github.com/kumvjs/KuVibeAdmin。

## Users and domain

- Administrative web clients, with Vben Admin as the currently documented frontend target.
- Authenticated users, roles, menus/button permissions, refresh-token sessions, and system administrators.
- Vben v5.7.0 的部门、用户、角色、菜单、时区和附件后端已完成并通过 M8 集成/浏览器验收。

## Repository shape

- `packages/backend`: NestJS application and database migrations.
- `packages/frontend/playground`: 真实登录、现有用户列表与积分/充值/订单页面，沿用 Vben 布局及后端菜单权限；其他上游示例应用保持原配置。
- `packages/backend/src/modules/auth`: login, refresh, logout, token lifecycle.
- `packages/backend/src/modules/user`: current-user data and user-role relationships.
- `packages/backend/src/modules/system`: system users, roles, menus, and logs.
- `docs`: VitePress project documentation and generated/published API guidance.
- `.agents`: KuVibe state, durable context, workflows, and engineering work artifacts.

## Established constraints

- Keep NestJS, TypeORM, PostgreSQL, Redis, Fastify, pnpm, and ESM; normal feature work must not reopen stack selection.
- Vben 源码升级与业务修改遵循根 AGENTS.md 的“Vben 上游维护边界”：业务通过应用扩展，未提出登录界面需求时保留其上游交互；必要修改逐项记录依据。
- Default HTTP prefix is `/api`.
- Public API responses are wrapped by the global response interceptor unless explicitly skipped.
- Swagger/OpenAPI is the canonical endpoint reference; planning artifacts must not become a duplicate public API manual.
- Existing authentication endpoints and data model must be extended compatibly rather than replaced without an approved migration.

## 项目语言

- 主要语言：简体中文（zh-CN）。依据：`docs/index.md`、`docs/guide/overview.md`、`docs/frontend/vben.md` 的项目原创内容以中文为主；`packages/backend/README.md` 的英文框架模板不作为主要依据。
- 适用范围：新生成或实质修改的项目文档、上下文、工作流、计划、需求、分析、验收、工程笔记、测试说明、注释及 PR / Issue 描述。现有英文文档和历史笔记保留，不批量翻译；源文件遵循稳定的局部注释惯例。
- 已有例外：近期 Git 提交说明持续使用英文，后续提交说明沿用英文及 Conventional Commit 语法。
- 技术标识符、API 路径、配置键、机器元数据和规范文件名保持原样；工程笔记文件名使用 `YYYYMMDD-HHmm-TYPE-SLUG.md`，正文使用中文。
- 与用户交流使用用户当前语言；普通对话语言切换不改变本约定，仅在用户明确要求调整项目惯例时修改。

## 产品版本约定

- 版本来源为根 `package.json` 和私有应用 `packages/backend/package.json`；当前两者均为 `2.0.1`，`docs/package.json` 无版本。每次决策读取实际清单，不使用本段快照覆盖清单。当前版本已达到 1.0.0，按 SemVer 判断 patch/minor/major；不套用 KuVibe 自身的 pre-1.0 政策。
- 撤销此前“开发期默认延后递增”的 Agent 推断：缺少发布脚本、CHANGELOG 及历史递增记录不能证明存在延后政策。仅明确用户决定、发布政策或实际生效的自动化及其递增触发条件可支持 deferred；旧工程笔记保留作历史，不作为例外依据。
- 固定统一版本：以根 `package.json` 为发布权威，`packages/backend/package.json` 同步相同版本；依据为用户在 2026-09-17 本次刷新中明确选择“统一版本：根目录与 core 同步递增”。按整个完成需求的最高语义影响递增一次，不按包分别重复递增；`docs/package.json` 继续无版本。
- 每个完整需求通过实现、验收、审查和文档检查后，仅评估一次版本影响；按 `kuVibe.md` §30.1 记录需求标识、基线、目标、语义/有效影响及版本来源，重试沿用原决定。范围明确且无有效例外时实际递增，同步相关清单、内部依赖、锁文件和 CHANGELOG；总结必须报告影响、结果、旧版本 → 新版本及原因。
- 前端为引入的 Vben monorepo，`packages/frontend/package.json` 5.7.0 与 `playground/package.json` 5.8.0 在引入提交 `8803343` 已并存，名称分别为 vben-admin-monorepo/@vben/playground。上述上游包标识不属于根/backend 统一产品版本来源，当前接入未改变其版本或依赖清单；后续若调整前端发布边界，须先形成明确约定。
- KuVibe 安装版本独立保存在 `.agents/kuvibe.yaml`，仅在采用、刷新或迁移协议时更新；版本变更不授权提交、打标签或发布。

## 交付与验收入口

根目录提供 start:local/start:dev/start:prod/build/setup/test/typecheck/docs:* 及迁移命令，自动在 packages/backend 执行，环境文件仍放在 packages/backend。后端为私有应用包 @kumvjs/kuvibe-admin-backend；正式版本使用 GitHub Release，不发布 npm。可重复验收见 docs/guide/release-verification.md；团队提示词仍以 docs/guide/getting-started.md#团队统一使用方式 为统一入口。DTO 部分更新须使用 hasSubmittedField 区分 undefined 与显式 null，不能仅依据 Object.hasOwn。


## Docker 运行

开发前端使用 compose.dev.frontend.yaml 叠加原开发环境，普通 node 用户、回环端口5999、只读热更新挂载、同源 /api 代理；独立 pnpm 锁文件与镜像依赖隔离。启动与边界见 docs/frontend/billing.md。

根 Dockerfile 与 compose.yaml 提供后端、PostgreSQL 18.6-bookworm 和 Redis 8；使用 PostgreSQL 18 的 /var/lib/postgresql 数据卷布局。根 .env 独立保存容器配置和随机密钥，scripts/docker-init.mjs 不覆盖已有文件；迁移和 setup 显式运行，后端 node 普通用户，数据库/Redis/附件/公开资源分别持久化。Docker 本地默认 local，生产必须按 docs/guide/docker.md 配置 HTTPS/CORS/Secure Cookie。新增 1790744400000 迁移补齐 CommonEntity 已预留的 tenant_id，非 1 数据时拒绝回滚；不提供租户隔离能力。

## 任务调度与消息

2026-09-30新增 tasks 模块与 Playground“系统管理 → 任务调度”，支持在线六段 cron/IANA 配置、启停、手动执行和持久执行快照。只调用注册处理器，跨实例使用 PostgreSQL 调度键/锁，单实例并发与等待队列有界；删除任务保留历史，执行日志默认30天分批清理。

订单 outbox 为异步业务真源，RabbitMQ只发送 ID；保持资金领域幂等、租约、有限重试及待确认语义。账务worker与附件清理已移除setInterval，默认任务为billing.outbox和attachments.cleanup。RabbitMQ固定4.3.6-management，新增独立密码/vhost/持久卷与回环管理端口；开发宿主机AMQP5673、管理15673。

根pnpm工作区只包括docs/backend，Vben保持自身独立workspace/catalog/锁。pnpm11显式virtualStoreType: project，保持本地与CI一致；独立backend锁仍供Docker冻结构建。watch入口--no-shell，启动失败清理Nest资源，避免重复消费者。

使用、恢复及两项重复集成测试见docs/modules/task-scheduling.md。仅本地开发迁移/部署已完成，Atlas CLI lint及生产升级未执行；旧points-recharge-orders真实四渠道与生产容量门槛仍在active，独立需求版本归属需核对，不能直接覆盖当前权威版本清单。

## 系统字典

2026-10-03完整重构：sys_dict单表邻接树与cache_enabled默认false；管理默认按层懒加载，/system/dict/list保留管理员全量视角并需system:dict:list，普通业务只用指定ID children/descendants。热点业务Cache-Aside、写后直接DEL、Redis故障DB降级；移除旧revision整树缓存、rootCode和路径响应。编码及已设置值不可改写，正常淘汰用停用，启停独立system:dict:disable，无删除API。32层/10000节点/3秒查询保护，当前仍单租户预留字段。升级迁移1790983591215仅新增开关；隔离PG/Redis/HTTP/UI验收完成。2026-10-03按用户授权更新现有kuvibe-admin-dev snapshot容器到2.0.1：备份恢复和三条待迁移up/down/up验证后完成本地开发库迁移、setup与五项服务健康检查；生产未部署。规则与恢复见docs/modules/dictionary.md，部署记录见20261003-1052-deploy-docker-2-0-1.md。
