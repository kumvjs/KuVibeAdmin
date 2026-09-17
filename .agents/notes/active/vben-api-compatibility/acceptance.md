# Planning Acceptance

- [x] Stable Vben baseline is identified by tag and immutable commit SHA.
- [x] `@vben/backend-mock` publication/installation suitability is evaluated.
- [x] Backend mock handlers and frontend-declared APIs are compared at the same commit.
- [x] Minimal runtime, system-management, preference, and playground APIs are separated.
- [x] Existing same-path backend endpoints are identified without claiming behavioral compatibility.
- [x] Persistence, business-rule, security, cache, migration, and contract-test work is represented in the backlog.
- [x] Swagger remains the API reference; no duplicate public endpoint document is introduced.
- [x] No endpoint/entity/service/migration implementation is performed in this phase.

Later implementation acceptance is defined per milestone in `plan.md` and must be refined before each milestone starts.

## Completed batch: M0.1

- [x] Upstream repository, tag, full SHA, source paths, expected counts, and snapshot path are machine-readable.
- [x] Collection uses a temporary shallow/filtered/sparse clone and verifies the checked-out SHA.
- [x] The snapshot deterministically records 31 frontend endpoints, 22 mock-covered endpoints, 9 frontend-only endpoints, and 2 mock-only diagnostics.
- [x] Hidden Nitro handler files such as `api/system/dept/.post.ts` are collected.
- [x] A clean network-backed collection reproduces the committed snapshot.
- [x] No application endpoint, authentication, authorization, entity, or migration code changed.

## Completed batch: M0.2

- [x] Candidate refs can be compared with the locked snapshot for route, method, request, response, mock-coverage, and source-only changes.
- [x] Same-ref comparison against `v5.7.0` reports no changes.
- [x] A scheduled/manual main warning reports drift without changing the stable lock or committed snapshot.
- [x] The upstream-upgrade PR template requires compatibility, migration, rollout, support-window, verification, and rollback decisions.
- [x] Frozen fixtures cover success/error envelopes, `{ items,total }` pagination, 401/403, refresh-cookie behavior, dynamic routes, and bigint serialization.
- [x] Contract parser/diff tests cover typed and multiline calls, hidden Nitro routes, and every required diff classification.
- [x] No application endpoint, authentication, authorization, entity, migration, or Swagger code changed.

## Completed batch: M1.1

- [x] `/auth/login` contract tests preserve `ResOp<{ accessToken }>` and the HttpOnly refresh cookie.
- [x] `/auth/refresh` contract tests preserve `ResOp<{ accessToken }>` while replacing the refresh cookie; missing cookies return HTTP 401.
- [x] `/auth/logout` contract tests prove delegation to the established access-token invalidation path without rewriting it.
- [x] `/user/info` maps bigint `id` to string `userId` through a dedicated Swagger DTO and does not expose entity/audit/password fields.
- [x] The frozen refresh fixture reflects the project OpenAPI client's `ResOp` unwrapping contract rather than the upstream mock's raw-token exception.
- [x] Focused Jest tests, test type-checking, lint, Nest build, and locked Vben fixture validation pass.

## Completed batch: M1.2

- [x] Refresh verifies the JWT, Redis state, database ownership, and expiration before rotation.
- [x] PostgreSQL atomic deletion is the single-use consumption point; a concurrent/replayed old token cannot issue a second token pair.
- [x] Successful rotation removes the old Redis refresh state, persists/caches a new Refresh Token, and issues a new Access Token.
- [x] Logout blacklists/removes the current Access Token, deletes the presented Refresh Token from PostgreSQL/Redis, and clears the browser cookie.
- [x] Malformed logout cookies are deleted by opaque value without trusting an invalid JWT payload.
- [x] The Vben integration guide includes the Swagger → OpenAPI-TS → `apiClient` generation, unwrapping, login, user-info, and refresh path.
- [x] Four focused Jest suites (11 tests), test type-checking, lint, Nest build, contract fixtures, and Markdown diff checks pass; the VitePress build is unverified because documentation dependencies are not installed locally.

## Completed batch: M1.3

- [x] `sys_user` persists nullable avatar URL, home path, and description through a reversible TypeORM migration.
- [x] `/user/info` returns explicit `userId`, `username`, `realName`, `avatar`, `homePath`, `desc`, and `roles` fields inside `ResOp`.
- [x] Existing NULL profile values normalize to empty strings without inventing a URL or route.
- [x] Access tokens, password fields, entity relations, and audit columns are excluded from the response DTO.
- [x] The compiled migration discovery path matches Nest's actual `dist/src/migrations` output.
- [x] Focused DTO/migration tests, test type-checking, lint, and Nest build pass; applying the migration to a live PostgreSQL database remains an environment deployment step.

## Completed batch: M1.4

- [x] `/auth/codes` returns effective menu/button permission codes rather than role codes, still wrapped by `ResOp<string[]>`.
- [x] Normal users receive codes only from enabled assigned roles and enabled menu/button records; comma-separated values are trimmed, empty values removed, duplicates removed, and results sorted deterministically.
- [x] A user with the enabled `super` role receives every enabled menu/button permission code without requiring explicit role-menu mappings.
- [x] Version-matching Redis permission-cache hits, including an empty `codes` array, do not query PostgreSQL; misses and legacy unversioned values load and repopulate the cache.
- [x] `RbacGuard` and `/auth/codes` use the same cache-backed effective-permission resolver.
- [x] A targeted permission-cache invalidation API exists for later menu/role/user transaction hooks, and its behavior is tested.
- [x] Swagger, current RBAC/Vben docs, focused tests, type-checking, lint, Nest build, contract parser tests, and locked Vben fixtures are updated and verified.

## Completed batch: M1.5

- [x] Local/development CORS defaults allow the locked Vben playground and Ant Design Vue app origins without using a credentialed wildcard; production requires an explicit HTTPS origin list.
- [x] Production requires an HTTPS public API URL and a Secure Refresh Token Cookie; `SameSite=None` is rejected unless Secure is enabled.
- [x] Refresh Cookie options are centralized, host-only by default, scoped to the API auth path, configurable for SameSite/Domain, and applied identically on login, refresh, and logout clearing.
- [x] Unsafe browser requests with an untrusted `Origin` receive HTTP 403 before authentication/business logic; trusted origins, preflight/safe methods, and non-browser requests without Origin remain supported.
- [x] The Fastify adapter no longer fabricates an Origin header when clients omit it.
- [x] Environment validation, controller Cookie contracts, trusted-origin behavior, docs, type-checking, lint, Nest build, contract parser tests, and locked Vben fixtures pass.

## Completed batch: M1.6

- [x] Unknown users and wrong passwords keep the same generic credential error; a disabled account is disclosed only after its submitted password verifies.
- [x] A disabled user cannot generate Access/Refresh Tokens, seed login caches, or create a login-success log.
- [x] Successful internal validation does not return `password_hash` or legacy `psalt`.
- [x] No password hashes are bulk-converted and no new account/reset flow copies the MD5 implementation.
- [x] M5 contains an actionable Argon2id-first mixed-hash migration, opportunistic rehash, inactive-account reset, session invalidation, rollout, and rollback checklist based on current OWASP guidance.
- [x] Request-lifecycle/auth documentation, focused and full tests, type-checking, lint, Nest build, contract parser tests, and locked Vben fixtures pass.

## Completed batch: M2.1–M2.2

- [x] Shared menu types represent `catalog`, `menu`, `embedded`, `link`, and `button`, with Vben-native numeric `0 | 1` status and extensible JSONB metadata.
- [x] Swagger write/list/dynamic-route DTOs express bigint IDs as strings, `pid`, recursive children, conditional route fields, and the complete known Vben metadata surface without requiring a domain adapter.
- [x] `SysMenuEntity` directly persists Vben semantics using `pid`, `name`, `path`, `auth_code`, `type`, `component`, `redirect`, `meta`, and `status`, plus self/role relations; legacy presentation columns are removed.
- [x] The fresh table model enforces five allowed types, numeric status, restrictive parent deletion, and unique name/path/authCode constraints; no legacy migration is created by design.
- [x] Effective permission queries retain their existing role/super-role behavior, read one canonical `authCode` per row, filter numeric enabled status, and deduplicate role-join results.
- [x] No menu endpoint or write business logic is exposed in this batch.
- [x] DTO/entity/permission tests, type-checking, lint, Nest build, contract parser tests, locked Vben fixtures, docs, and diff checks pass.

## Completed batch: M2.3

- [x] `GET /menu/all` is authenticated, documented by Swagger, and remains wrapped by the global `ResOp<VbenRouteRecordDto[]>` contract.
- [x] Enabled super users receive all enabled non-button routes; ordinary users receive routes granted through enabled roles and role-menu mappings.
- [x] A granted descendant or button includes its complete enabled route-parent chain, while disabled/orphaned/cyclic/pathless branches and button nodes are not emitted.
- [x] Route trees preserve Vben metadata and optional component/redirect fields, serialize bigint identity only internally, and sort recursively by `meta.order`, then unique name.
- [x] `sys_role_menu` uses bigint foreign keys, unique role/menu pairs, indexes, and deletion policies compatible with the rebuilt tables.
- [x] No system-menu list, existence check, CRUD, or cache invalidation write hook is implemented in this batch.
- [x] Service/controller/schema tests, full regression tests, type-checking, lint, Nest build, contract fixtures, docs, and diff checks pass.

## Completed batch: M2.4

- [x] `GET /system/menu/list` is authenticated, requires the canonical menu-list permission, and has a Swagger `ResOp<VbenMenuResponseDto[]>` contract.
- [x] The response contains every non-deleted catalog/menu/embedded/link/button record, including disabled records, without exposing entity audit fields or relations.
- [x] Bigint `id`/`pid`, numeric status, extensible metadata, optional route fields, and the v5.7.0 form-compatible top-level `activePath` retain Vben-compatible shapes without adding a redundant database column.
- [x] Every record appears exactly once in a recursively ordered tree; malformed missing/self/cyclic parent links are normalized safely without producing circular JSON.
- [x] No existence check, create/update/delete logic, or cache invalidation hook is implemented in this batch.
- [x] Focused and full tests, type-checking, lint, Nest build, locked Vben contract fixtures, docs, and diff checks pass.

## Completed batch: M2.5

- [x] Remove the redundant direct `MenuModule` import from `AppModule` without changing `/menu/all` or `/system/menu/*` controller paths.
- [x] `GET /system/menu/name-exists` and `GET /system/menu/path-exists` are authenticated, require `system:menu:list`, and expose Swagger `ResOp<boolean>` contracts.
- [x] Both endpoints validate their required query value and an optional positive bigint-string edit ID.
- [x] Existence queries use the same exact, case-sensitive value semantics as the active-row unique indexes and exclude only the supplied edit ID.
- [x] Soft-deleted rows remain excluded through TypeORM's default repository scope, and partial unique indexes allow their values to be reused without a later write conflict.
- [x] No menu create/update/delete logic or cache invalidation hook is implemented in this batch.
- [x] Focused and full tests, type-checking, lint, Nest build, locked Vben contract fixtures, docs, and diff checks pass.

## Completed batch: M2.6

- [x] `POST /system/menu`, `PUT /system/menu/:id`, and `DELETE /system/menu/:id` use dedicated create/update/delete permissions and preserve the global `ResOp<boolean>` response contract.
- [x] Create and update enforce the locked Vben form's five type-dependent contracts: route paths, menu components, embedded/link HTTP(S) targets, button permission codes, titles, and compatible `activePath`/`linkSrc` metadata mapping.
- [x] Names, paths, permission codes, component identifiers, metadata values, PostgreSQL bigint IDs, and concurrent unique-constraint failures are validated without trusting the frontend prechecks.
- [x] Parent records must exist and be parent-capable; self-parenting, existing corrupt ancestor chains, descendant reparenting, and converting a node with children into a leaf type are rejected in a serializable write transaction.
- [x] Delete is a soft delete and is rejected while active children or active role-menu references exist.
- [x] After commit, menu writes invalidate permission caches for distinct users assigned through the affected menu's enabled roles plus users assigned the enabled super role; create invalidates super users without scanning Redis.
- [x] Focused/full tests, test type-checking, changed-file ESLint, Nest build, locked Vben fixtures/diff, docs, and diff checks pass. Repository-wide ESLint still reports pre-existing errors outside this batch, and VitePress dependencies are not installed.

## Completed batch: M3

- [x] `SysDeptEntity` directly models bigint `pid`, Vben `name/status/remark`, business `order`, soft deletion, sibling-name uniqueness, and a restrictive self-reference; `SysUserEntity` gains an indexed nullable restrictive `deptId` relation.
- [x] No migration or database DDL is generated or executed; the deployment owner creates/rebuilds the table and user column from the entity contract.
- [x] `GET /system/dept/list` returns every active department exactly once as a deterministic `order/name/id` tree with bigint IDs serialized as strings and `createdAt` mapped to `createTime`.
- [x] POST/PUT/DELETE use dedicated permissions, explicit Swagger DTOs, `ResOp<boolean>`, PostgreSQL bigint validation, serializable transactions, and stable conflict/error behavior.
- [x] Parent existence, self/descendant cycles, sibling duplicate names, active child deletion, and user-reference deletion are rejected; database constraints remain the final concurrent-write safeguard.
- [x] Disabling a department changes only that department and never silently changes child departments or users.
- [x] Focused/full tests, test type-checking, changed-file ESLint, Nest build, locked Vben fixtures/diff, docs, and diff checks pass proportionally.

## Completed batch: M4

- [x] `SysRoleEntity` directly models immutable globally unique `code`, active-row unique display `name`, numeric `status`, nullable `remark`, deployment-owned `is_default`, audit fields, and soft deletion; no migration or DDL is generated or executed.
- [x] `sys_role_menu` retains constrained bigint role/menu relationships and unique mappings; role permission replacement validates every active menu ID before changing mappings.
- [x] `GET /system/role/list` accepts validated `page/pageSize/name/id/status/remark/startTime/endTime` filters and returns `{ items,total }` with bigint strings, `createdAt -> createTime`, and deterministic permission-ID arrays.
- [x] POST/PUT/DELETE use dedicated permissions, explicit Swagger DTOs, `ResOp<boolean>`, PostgreSQL bigint validation, serializable transactions, and stable conflict/error behavior.
- [x] Role codes cannot change after creation; omitted custom codes are generated, and public creation cannot claim reserved built-in codes.
- [x] Enabled `super` roles and roles marked `is_default` cannot be disabled or deleted; deletion is also rejected while any user-role reference remains.
- [x] Mapping and status writes invalidate every currently assigned user's effective-permission cache after commit without scanning Redis; name/remark writes use the same safe invalidation path.
- [x] Focused/full tests, test type-checking, changed-file ESLint, Nest build, locked Vben fixtures/diff, docs, and diff checks pass proportionally.

## Completed batch: M5

- [x] `SysUserEntity` directly models immutable username, editable Vben name, numeric status, department, remark/timezone/profile fields, Argon2id PHC credentials, session version, audit fields, and active-only username uniqueness; no migration or DDL is generated.
- [x] `GET /system/user/list` validates the locked Vben filters and returns `{ items,total }` with bigint strings, `createdAt -> createTime`, and deterministic `roleIds`.
- [x] POST/PUT/DELETE use dedicated permissions, explicit Swagger DTOs, `ResOp<boolean>`, PostgreSQL bigint validation, serializable transactions, and stable conflict behavior.
- [x] User authorization remains role-based: all submitted enabled roles are locked and validated before the user-role set is replaced atomically; omitted `roleIds` preserve existing mappings.
- [x] Create and reset accept only 12–128 character passwords and store maintained Argon2id PHC hashes at or above the current OWASP floor; legacy MD5, salt, and redundant role columns are absent from the fresh schema.
- [x] Disable/password-reset/delete revoke persisted Refresh Tokens and targeted Redis session state, while all updates invalidate user-info and effective-permission caches after commit.
- [x] Access validation rejects disabled users, refresh validates persisted status/session version, and serializable last-super checks preserve at least one enabled super-administrator path.
- [x] Soft delete removes user-role mappings and allows intentional username reuse only for a new user ID; audit fields continue through the shared subscriber.

## Completed batch: M7

The temporary-upload checks below record the original implementation. They do not constitute acceptance of the newly requested system attachment module; M7.1 replaces that scope.

- [x] The real Playground module compiles with globally registered app configuration; the upload service injects `APP_CONFIG.KEY`, not the configuration factory. Regression test reproduced the startup exception before the fix and passes afterward.
- [x] A dedicated Playground module exposes exactly the four locked frontend contracts outside production and is not registered when `NODE_ENV=production`.
- [x] `GET /table/list` requires authentication, validates bounded pagination/sorting, returns deterministic `{ items,total }` fixtures, and creates no product table.
- [x] `POST /upload` requires authentication and one `file`; only JPEG/PNG/WebP content with matching MIME and magic bytes up to 6 MiB is stored under a random name.
- [x] Temporary images use the existing local static root, return an origin-based `/uploads/...` URL, expire after 24 hours, create no metadata table, and remain unavailable in production.
- [x] `GET /demo/bigint` requires authentication and preserves the locked oversized integer literals through an explicit raw-JSON response boundary.
- [x] `GET /status` is public only inside the non-production module, returns the requested HTTP status with the standard error envelope, and defaults to 200 so the params-serializer demo can inspect its response URL.
- [x] Mock-only `GET /test` and `POST /test` are absent.
- [x] M7.1 supersedes the temporary upload; system attachment acceptance is recorded below.
- [x] Focused/full tests, test type-checking, changed-file ESLint, Nest build, locked Vben fixtures, docs, and diff checks pass proportionally.

## Completed batch: M7.1 entity and policy foundation

- [x] Three explicitly typed PostgreSQL entities build valid TypeORM metadata without database access; attachment references use a restrictive foreign key and unique active mappings.
- [x] Policy read/full replacement use dedicated RBAC permissions, Swagger DTOs, the standard JSON envelope, validated purpose identifiers, format/size/count/retention rules, and transactional writes.
- [x] Policy cache hits bypass policy-table reads; cached invalid data is not trusted; missing/disabled/invalid policies fail closed at the service boundary.
- [x] Generation-fenced refill rejects old queries after invalidation. Tests cover negative caching, process-local request coalescing, Redis failure rate limits, invalidation retries, and no invalidation after rollback.
- [x] Focused tests: 4 suites / 32 tests. Full tests: 40 suites / 233 tests. TypeScript, changed-code ESLint, Nest build and diff checks pass. PostgreSQL constraint execution and Redis Lua execution have not been integration-tested.

## Completed M7.1 — System attachment management

- [x] System `POST /upload` is available outside Playground, preserves single multipart `file` and `ResOp`/`url`, and returns HTTP 200 matching Swagger. Policy values govern limits, formats and image dimensions.
- [x] Thirteen configured formats are exercised against real validators, including Office-container spoofing rejection. Files stream into non-static storage, unsafe paths/symlinks are rejected, multipart streams closed before persistence fail promptly, and unsuccessful requests compensate their files.
- [x] Private downloads reject anonymous/cross-user access; explicit administrator permissions guard management routes. Unknown business references do not authorize the owner. Public avatars require active user/profile binding.
- [x] Avatar binding/unbinding and legacy profile replacement preserve URL response compatibility while tracking references. Cleanup and binding serialize on attachment locks; referenced files survive cleanup/deletion attempts.
- [x] PostgreSQL executes foreign-key/unique/check constraints and real failed-ready-write/business rollback tests. Physical-delete failure leaves retryable state. Upload and download-authorization audit records persist.
- [x] Real Redis tests prove cache hits avoid policy queries and stale concurrent refills are fenced. Unit tests cover Redis failure and bounded fallback/invalidation retries.
- [x] Final verification: 40 Jest suites / 233 tests; 19 disposable PostgreSQL/Redis/Fastify checks under production environment; TypeScript, changed-code ESLint, Nest build, VitePress build, Vben lock/snapshot/fixtures and diff checks passed.
- [x] No migration or business-database DDL was executed; test schemas/prefixes and temporary files are isolated. Antivirus remains an explicitly unscanned replaceable provider by default; full browser/login e2e is not claimed and remains M8.

## 已完成 M6 — 用户时区与统一工具

- [x] null 表示跟随设备；偏好只读写当前有效用户，重建数据库连接后仍可读取，其他用户不受影响。
- [x] 公开选项保持 label/value；全量 IANA 区域不附固定 GMT 偏移，所有写入入口拒绝非法标识。
- [x] Swagger 与真实 HTTP 的 nullable、必填字段、200/422、匿名拒绝及 ResOp 契约一致。
- [x] 日期转换覆盖严格校验、跨年闰日、夏令时 23/25 小时、跳日和异常零点；UTC/上海/纽约进程结果相同。
- [x] 实体默认精度与真实 PostgreSQL 微秒边界验证通过；不同会话时区读写同一时间点，偏好部分更新/软删除/禁用约束通过。
- [x] 43 套件 / 283 测试、时间集成 3 项、数据库配置 2 项、契约工具 3 项及构建/静态检查通过；无业务库迁移或 setup 执行。
- [x] minor / bumped，根目录及 core 1.0.1 → 1.1.0；完整前端/Passport e2e 仍属于 M8。

详见[完成记录](../../implemented/20260917-2013-feature-m6-timezone-tools.md)。
