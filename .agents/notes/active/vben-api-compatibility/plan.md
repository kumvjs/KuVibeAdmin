# Vben Backend TODO

This is an implementation backlog, not authorization to implement all items in one change. Complete milestones in order and refine their acceptance criteria before coding.

## M0 — Upstream contract and version foundation

- [x] Add a machine-readable upstream lock containing repository, tag, full commit SHA, collected paths, and timestamp.
- [x] Add a read-only collector that shallow-clones and sparse-checks out the locked Vben commit into a temporary/cache directory.
- [x] Generate a snapshot for all 31 frontend-declared local API calls; track the two mock-only diagnostics separately.
- [x] Diff a candidate stable tag against the lock and report added, removed, renamed, method-changed, request-changed, response-changed, and mock-data-only changes.
- [x] Add an optional main-branch early-warning job that never updates the stable lock automatically.
- [x] Add upgrade-PR fields for compatibility class, schema/data migration, frontend rollout, rollback, and supported-baseline window.
- [x] Define frozen contract fixtures for success/error envelopes, `{ items,total }` pagination, 401/403, refresh cookies, dynamic routes, and bigint serialization.

Acceptance: the same commit always generates the same normalized contract; a route present only in frontend callers is reported rather than lost; upstream changes cannot silently alter production behavior.

## M1 — Stabilize existing authentication compatibility

- [x] Add Vben v5.7.0-derived contract tests for existing `/auth/login`, `/auth/refresh`, `/auth/logout`, and `/user/info`; assert the project's canonical `ResOp<T>` envelope and do not rewrite working login logic.
- [x] Verify/fix refresh behavior through the generated OpenAPI client contract `ResOp<{ accessToken }>`, including token rotation, replay rejection, cookie replacement, and logout invalidation; never introduce a raw-response exception.
- [x] Add a dedicated `/user/info` response DTO mapping `id -> userId` and compatible profile fields; stop exposing `SysUserEntity` as the public contract.
- [x] Change `/auth/codes` from role codes to effective menu/button permission codes and align Redis permission-cache invalidation.
- [x] Define environment-specific CORS origin, HTTPS, SameSite, Secure, Domain, and CSRF behavior for credentialed requests.
- [x] Verify disabled users cannot log in and password hashing is scheduled for Argon2id/bcrypt migration rather than copied from the current MD5 approach.

Acceptance: the project's Vben v5.7.0 frontend using the generated OpenAPI client can log in, unwrap `ResOp`, load user data/codes, refresh once with rotation, reject refresh replay, and log out.

## M2 — Dynamic menu and permission backbone

- [x] Define Vben-native menu types plus Swagger request/response DTOs for all five menu types and extensible metadata, without a redundant adapter layer.
- [x] Redesign `sys_menu` as a fresh Vben-native table with JSONB metadata, bigint `pid`, numeric status, constraints, and indexes; existing menu data is intentionally not migrated.
- [x] Implement `GET /menu/all` from enabled user roles and role-menu mappings, including required parent nodes and deterministic ordering.
- [x] Implement `GET /system/menu/list` as a complete menu/button tree.
- [x] Implement `GET /system/menu/name-exists` and `GET /system/menu/path-exists` with edit-ID exclusion.
- [x] Implement `POST /system/menu`, `PUT /system/menu/:id`, and `DELETE /system/menu/:id`.
- [x] Enforce name/path/authCode rules, safe component/link values, valid type-dependent fields, and no parent cycles.
- [x] Reject deletion with children or role references unless an explicit reviewed replacement workflow exists.
- [x] Invalidate affected users' menu/permission caches after committed menu changes; M4 owns mapping changes.

Acceptance: menus are persistent, authorization-derived, safely editable, and returned in Vben route format; action codes and route visibility reflect the same effective permissions.

## M3 — Department persistence

- [x] Define a fresh `sys_dept` entity with parent ID, name, status, remark, order, and audit fields; database creation is deployment-owned and no migration is generated.
- [x] Add an indexed nullable department foreign key mapping to `sys_user` with a restrictive deletion policy; database DDL remains deployment-owned.
- [x] Implement `GET /system/dept/list` as a deterministic tree.
- [x] Implement `POST /system/dept`, `PUT /system/dept/:id`, and `DELETE /system/dept/:id`.
- [x] Reject cyclic parents and deletion when child departments or users exist.
- [x] Decide and test how disabling a department affects descendants and users: only the selected department changes.

Acceptance: department writes persist, tree invariants hold under concurrent updates, and destructive operations cannot orphan users or descendants.

## M4 — Role management

- [x] Implement Vben `{ items,total }` role pagination with `page,pageSize,name,id,status,remark,startTime,endTime`.
- [x] Implement `POST /system/role`, `PUT /system/role/:id`, and `DELETE /system/role/:id`; database creation remains deployment-owned and no migration is generated.
- [x] Keep immutable unique role `code` separate from editable display `name`.
- [x] Replace `sys_role_menu` permissions transactionally and validate every referenced menu/button ID.
- [x] Protect super/default roles and reject deletion of roles still assigned to users.
- [x] Invalidate effective permissions for every affected user after commit.

Acceptance: role CRUD and permission assignment are transactional, protected roles cannot be corrupted, and users observe new permissions without stale cache.

## M5 — User management

- [x] Resolve the contract decision with explicit `roleIds` and the existing RBAC model; do not persist direct per-user menu grants.
- [x] Extend user/profile persistence for department, timezone, remark, and the existing avatar, home-path, and description fields.
- [x] Adapt `GET /system/user/list` to `{ items,total }` and accept validated Vben `page/pageSize` filters including `deptId` and time range.
- [x] Implement `POST /system/user`, `PUT /system/user/:id`, and `DELETE /system/user/:id` with DTOs separate from entities.
- [x] Implement transactional role assignment and targeted permission/session-cache invalidation.
- [x] Define soft delete, active-only username reuse, numeric status toggling, password create/reset, forced logout, and audit rules.
- [x] Prevent disabling, deleting, or removing super access from the last enabled super administrator.
- [x] Use a fresh Argon2id-only schema with explicit algorithm marker, PHC hashes, and persisted session version; per deployment instruction, generate no migration or legacy MD5 compatibility.
- [x] Select maintained `argon2`, enforce the current OWASP parameter floor, expose environment tuning, and locally smoke-benchmark the default; production hardware calibration remains a deployment gate.
- [x] Make create/reset paths Argon2id-only and remove the MD5/`psalt` implementation from the fresh entity and setup flow.
- [x] Increment the persisted session version and revoke other Access/Refresh Token state after password reset or account disable.
- [x] Reject refresh for disabled, deleted, or session-version-mismatched users; no mixed-hash rollout counters/deadline are needed for the fresh table.

Acceptance: user CRUD preserves RBAC and session invariants, returns Vben-compatible fields, and cannot remove the system's final administrative access path.

## M6 — 用户展示时区与统一时间工具（完成）

- [x] 复用 sys_user.timezone：null 跟随设备，IANA 字符串固定展示偏好；不从服务器或浏览器自动设置业务默认值。
- [x] 三个时区接口采用 Swagger/ResOp；选项公开，个人读写仅当前登录用户，支持 null 清空。
- [x] 用户管理及个人偏好共用 IANA 校验；数据库持久化、部分字段更新及用户缓存失效。
- [x] 提供纯 Day.js 工具：显式时区、严格日期/时间点、业务日和包含结束日期到半开时间点范围；23/25 小时日与异常零点有测试。
- [x] 时间点列统一 timestamptz 默认精度，不设置 precision；PostgreSQL 会话统一 UTC。用户明确不要求历史迁移，本次未生成或执行迁移。
- [x] 完成 HTTP/OpenAPI、工具、用户隔离、真实 PostgreSQL 持久化/微秒边界和跨进程 TZ 验证，更新接入文档。

验收：43 个 Jest 套件 / 283 项测试、3 项时间集成检查（含独立 PostgreSQL）、2 项数据库配置检查、3 项契约工具测试、TS、Nest/文档构建、改动代码 ESLint 与锁定 Vben 契约通过。浏览器与完整 Passport 链仍在 M8；当前仓库不包含 Vben 前端，客户端需接入 null 与统一日期转换。

版本：minor / bumped；根与 core 1.0.1 → 1.1.0，KuVibe schema/revision 不变。[完成记录](../../implemented/20260917-2013-feature-m6-timezone-tools.md)。

## M7 — Optional full-playground parity

Scope revision: the completed temporary upload below describes the original implementation only. System uploads now belong to M7.1; table, bigint, and status remain optional demos.

- [x] Fix upload configuration injection to use `APP_CONFIG.KEY` and cover actual Nest module dependency resolution with a regression test.
- [x] Implement authenticated `POST /upload` as a non-production local temporary-image adapter using the existing multipart/static stack, random object names, a 6 MiB limit, MIME/signature checks, public URLs, 24-hour cleanup, no metadata table, and no production route/static exposure.
- [x] Implement authenticated `GET /table/list` with deterministic fixture data and no fake product table.
- [x] Implement authenticated `GET /demo/bigint` as a fixed raw-JSON serialization fixture with no table.
- [x] Implement public `GET /status` only through the non-production Playground module, defaulting to HTTP 200 for the params-serializer demo.
- [x] Do not implement mock-only `GET /test` or `POST /test`.

Acceptance: retained examples serve an explicit frontend demo, introduce no fake production domain, and expose no diagnostic behavior in production.

## M7.1 — System attachment management (complete)

Design: [attachment-design.md](attachment-design.md). New tables are created by the deployment owner; no migration. The user approved default-private access, explicitly authorized public images, and local storage first. The verified system module replaces the original Playground upload; existing temporary files are not migrated or deleted.

- [x] Add explicitly typed attachment, upload-policy, and business-reference entities; implement permission-controlled policy management with validated settings and audit fields.
- [x] Cache policy reads in shared Redis; implement post-commit invalidation, bounded TTL, concurrent-refill protection, and tested cache-failure behavior; real Redis Lua/TTL and PostgreSQL constraints/transactions are verified in disposable containers.
- [x] Extract `POST /upload` into a production-capable UploadModule, implement configurable multi-format validation and streaming local storage outside the static webroot, and persist attachment metadata with failure compensation.
- [x] Add object-authorized private downloads, explicitly controlled public-image access, attachment pagination/detail/delete, and download auditing.
- [x] Add trusted business binding/unbinding and reference-aware cleanup; integrate avatar attachment references without silently changing existing URL consumers.
- [x] Verify HTTP/permission/storage/cache/concurrency behavior, update Swagger and current docs, and remove the superseded Playground upload code only when its replacement passes.

Acceptance: policy cache hits perform no policy-table reads; supported formats and limits change through managed settings; private bytes cannot bypass authorization through static paths; referenced files survive cleanup; metadata/storage failures are recoverable; production upload and existing Vben calls are verified.

Evidence: 40 Jest suites / 233 tests, 19 isolated PostgreSQL/Redis/Fastify integration checks under `NODE_ENV=production`, TypeScript, changed-code ESLint, Nest/VitePress builds, and locked Vben contract verification passed. HTTP tests verify the backend Vben upload contract, not a browser-driven frontend session; full login/Passport/Vben e2e remains M8. Deployment still owns creating four tables, initializing policies, persistent storage, and any antivirus integration.

## M8 — Verification and release gates

迁移工具补充（2026-09-16）：已修复空 `TYPEORM_SCHEMA` 导致重复生成全量表及 `sys_menu.meta` 默认值重复 ALTER。用户已执行基础表迁移；未执行的 `1789490156513-update-table.ts` 已修正为 4 张附件表的增量，部署方负责运行。本次仅进行了真实数据库只读差异验证，不代表 M8 的迁移执行/回滚验收完成。详见 [修复笔记](../../implemented/20260916-0041-fix-migration-schema.md)。

- [ ] Add DTO-validation, service-unit, PostgreSQL integration, Redis invalidation, HTTP contract, and Vben e2e tests per domain.
- [ ] Test unique/foreign-key constraints, cycle rejection, soft deletion, transaction rollback, concurrent state changes, and bigint string boundaries.
- [ ] Test permissions before and after menu/role/user changes to prove cache invalidation.
- [ ] Run Vben v5.7.0 login, refresh, dynamic menu, button permission, and system-management flows end to end.
- [ ] Update Swagger/OpenAPI with every implemented endpoint and contract; do not create a parallel API reference Markdown file.
- [ ] On each upstream-baseline upgrade, update the lock, snapshot, compatibility fixtures, active plan/current docs as applicable, and release notes.

Acceptance: focused and broad checks pass, Swagger matches runtime behavior, migrations and rollback are verified proportionally, and both supported Vben baselines pass their contract suites.
