# Project Context

<!-- kuvibe: template=project-context revision=1 ownership=project -->

## Product

KuVibeAdmin（原 Nest AI Boot）是基于 KuVibe 工程协议、面向 AI 辅助开发的 NestJS 管理系统后端。当前仅交付后端，Vben 前端独立接入；AI Agents 业务能力仍在规划。仓库为 https://github.com/kumvjs/KuVibeAdmin。

## Users and domain

- Administrative web clients, with Vben Admin as the currently documented frontend target.
- Authenticated users, roles, menus/button permissions, refresh-token sessions, and system administrators.
- Vben v5.7.0 的部门、用户、角色、菜单、时区和附件后端已完成并通过 M8 集成/浏览器验收。

## Repository shape

- `packages/core`: NestJS application and database migrations.
- `packages/core/src/modules/auth`: login, refresh, logout, token lifecycle.
- `packages/core/src/modules/user`: current-user data and user-role relationships.
- `packages/core/src/modules/system`: system users, roles, menus, and logs.
- `docs`: VitePress project documentation and generated/published API guidance.
- `.agents`: KuVibe state, durable context, workflows, and engineering work artifacts.

## Established constraints

- Keep NestJS, TypeORM, PostgreSQL, Redis, Fastify, pnpm, and ESM; normal feature work must not reopen stack selection.
- Default HTTP prefix is `/api`.
- Public API responses are wrapped by the global response interceptor unless explicitly skipped.
- Swagger/OpenAPI is the canonical endpoint reference; planning artifacts must not become a duplicate public API manual.
- Existing authentication endpoints and data model must be extended compatibly rather than replaced without an approved migration.

## 项目语言

- 主要语言：简体中文（zh-CN）。依据：`docs/index.md`、`docs/guide/overview.md`、`docs/frontend/vben.md` 的项目原创内容以中文为主；`packages/core/README.md` 的英文框架模板不作为主要依据。
- 适用范围：新生成或实质修改的项目文档、上下文、工作流、计划、需求、分析、验收、工程笔记、测试说明、注释及 PR / Issue 描述。现有英文文档和历史笔记保留，不批量翻译；源文件遵循稳定的局部注释惯例。
- 已有例外：近期 Git 提交说明持续使用英文，后续提交说明沿用英文及 Conventional Commit 语法。
- 技术标识符、API 路径、配置键、机器元数据和规范文件名保持原样；工程笔记文件名使用 `YYYYMMDD-HHmm-TYPE-SLUG.md`，正文使用中文。
- 与用户交流使用用户当前语言；普通对话语言切换不改变本约定，仅在用户明确要求调整项目惯例时修改。

## 产品版本约定

- 版本来源为根 `package.json` 和私有应用 `packages/core/package.json`；本次正式版两者均为 `1.2.0`，`docs/package.json` 无版本。每次决策读取实际清单，不使用本段快照覆盖清单。当前版本已达到 1.0.0，按 SemVer 判断 patch/minor/major；不套用 KuVibe 自身的 pre-1.0 政策。
- 撤销此前“开发期默认延后递增”的 Agent 推断：缺少发布脚本、CHANGELOG 及历史递增记录不能证明存在延后政策。仅明确用户决定、发布政策或实际生效的自动化及其递增触发条件可支持 deferred；旧工程笔记保留作历史，不作为例外依据。
- 固定统一版本：以根 `package.json` 为发布权威，`packages/core/package.json` 同步相同版本；依据为用户在 2026-09-17 本次刷新中明确选择“统一版本：根目录与 core 同步递增”。按整个完成需求的最高语义影响递增一次，不按包分别重复递增；`docs/package.json` 继续无版本。
- 每个完整需求通过实现、验收、审查和文档检查后，仅评估一次版本影响；按 `kuVibe.md` §30.1 记录需求标识、基线、目标、语义/有效影响及版本来源，重试沿用原决定。范围明确且无有效例外时实际递增，同步相关清单、内部依赖、锁文件和 CHANGELOG；总结必须报告影响、结果、旧版本 → 新版本及原因。
- KuVibe 安装版本独立保存在 `.agents/kuvibe.yaml`，仅在采用、刷新或迁移协议时更新；版本变更不授权提交、打标签或发布。

## 交付与验收入口

根目录提供 start:local/start:dev/start:prod/build/setup/test/typecheck/docs:* 及迁移命令，自动在 core 执行，环境文件仍放在 packages/core。后端为私有应用包 @kumvjs/kuvibe-admin-core；正式版本使用 GitHub Release，不发布 npm。可重复验收见 docs/guide/release-verification.md；团队提示词仍以 docs/guide/getting-started.md#团队统一使用方式 为统一入口。DTO 部分更新须使用 hasSubmittedField 区分 undefined 与显式 null，不能仅依据 Object.hasOwn。
