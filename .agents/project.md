# Project Context

<!-- kuvibe: template=project-context revision=1 ownership=project -->

## Product

Nest AI Boot is a NestJS backend foundation for administrative applications, Vben Admin integration, RBAC, PostgreSQL/Redis-backed authentication, WebSocket features, and AI capabilities.

## Users and domain

- Administrative web clients, with Vben Admin as the currently documented frontend target.
- Authenticated users, roles, menus/button permissions, refresh-token sessions, and system administrators.
- Planned Vben system-management domains include departments and complete user/role/menu management.

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

- 版本来源分别为根 `package.json`（当前 `1.0.0`）和私有应用 `packages/core/package.json`（当前 `0.0.1`）；`docs/package.json` 无版本。现有版本不同，未发现固定同步发布配置，不将它们强制统一。
- 当前证据：上述清单未定义发布命令，最近功能提交仍保留各自版本，仓库无 CHANGELOG 或专用产品发布流程。产品版本递增暂按现有开发期延后处理，每个完成需求记录语义影响及 deferred 理由；发布前需确定权威产品版本、包同步范围和 pre-1.0 策略，不套用 KuVibe 自身的版本政策。
- 每个完整需求通过实现、验收、审查和文档检查后，仅评估一次版本影响；按 `kuVibe.md` §30.1 记录需求标识、基线、目标、语义/有效影响及版本来源，重试沿用原决定。产品版本规则一经明确即按规则同步相关清单、内部依赖、锁文件和 CHANGELOG。
- KuVibe 安装版本独立保存在 `.agents/kuvibe.yaml`，仅在采用、刷新或迁移协议时更新；版本变更不授权提交、打标签或发布。
