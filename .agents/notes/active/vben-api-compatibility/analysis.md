# Vben API and Version Analysis

## Upstream decision

Use the official Git repository's stable tag plus full commit SHA as the compatibility baseline:

- Repository: `https://github.com/vbenjs/vue-vben-admin.git`
- Stable baseline: `v5.7.0`
- Commit: `63a38dce49ba109f61607994e21ba921d8e970e9`
- Baseline commit time: `2026-05-21T09:07:59+08:00`
- Researched on: `2026-09-07`
- Main observed for early warning: `d4b2b02c54175746ab96eda7e0c83a9574b7fca6`

Do not use `@vben/backend-mock` as an npm dependency. It is a private workspace (`private: true`) and the npm registry returns 404. Do not use a moving `main` commit as the production baseline. At the observed `main`, the workspace says `5.8.0` while the monorepo root remains `5.7.0`, so it represents unreleased development state.

The recommended retrieval method is a shallow, filtered, sparse Git clone into a temporary/cache directory at an immutable ref. Do not vendor the full Vben repository or add it as a runtime submodule. Record tag and SHA together because a SHA is immutable and a tag is readable.

## Sources that must be compared at the same commit

`apps/backend-mock` alone is incomplete. Collect contracts from:

1. `apps/backend-mock/api/**` — routes implemented by the mock;
2. `playground/src/api/**` — every backend call declared by the full demo;
3. `playground/src/views/system/**` — submitted fields, validation, and interaction semantics;
4. `apps/web-*/src/api/core/**` — minimal runtime contracts for UI variants;
5. `packages/types` and `packages/@core/base/typings` — user and route response types.

At v5.7.0 the frontend declares 31 local-server requests. The mock implements 22 of them, while 9 system CRUD requests are called by the frontend but missing from the mock. The mock also exposes two unused `/test` diagnostic routes. The department-create mock is the hidden file `api/system/dept/.post.ts`; tooling that ignores dotfiles will miss it. Between v5.7.0 and the observed main, no API route was added, removed, or renamed; main fixes missing imports in `setTimezone` and changes config/mock data.

## API inventory

Paths omit this project's default `/api` global prefix.

### Runtime and preferences (9)

| Method | Path | Contract summary | Current project |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ username, password } -> { accessToken }`; refresh cookie | Exists |
| POST | `/auth/refresh` | refresh cookie -> project contract `ResOp<{ accessToken }>`; generated OpenAPI client unwraps `data` | Exists; preserve envelope and contract-test it |
| POST | `/auth/logout` | invalidate login state and cookie/session | Exists |
| GET | `/auth/codes` | button/action permission `string[]` | Implemented with effective menu/button codes |
| GET | `/user/info` | `userId`, `username`, `realName`, `avatar`, `roles`, `homePath` and compatible profile fields | Implemented with a dedicated response DTO |
| GET | `/menu/all` | authorized `RouteRecordStringComponent[]` tree | Implemented in M2.3 |
| GET | `/timezone/getTimezoneOptions` | `Array<{ label, value }>` | Missing |
| GET | `/timezone/getTimezone` | current user's IANA timezone or null | Missing |
| POST | `/timezone/setTimezone` | `{ timezone }` | Missing |

### System management (18)

| Domain | Method and path | Request/query summary | Upstream mock | Current project |
| --- | --- | --- | --- | --- |
| Department | GET `/system/dept/list` | tree of `id,pid,name,status,remark,createTime,children` | Yes | Implemented in M3 |
| Department | POST `/system/dept` | `pid,name,status,remark` | Fake success only (`.post.ts`) | Implemented in M3 |
| Department | PUT `/system/dept/:id` | `pid,name,status,remark` | Fake success only | Implemented in M3 |
| Department | DELETE `/system/dept/:id` | id | Fake success only | Implemented in M3 |
| Menu | GET `/system/menu/list` | complete menu/button tree | Yes | Implemented in M2.4 |
| Menu | GET `/system/menu/name-exists` | query `name`, optional editing `id` | Yes | Implemented in M2.5 |
| Menu | GET `/system/menu/path-exists` | query `path`, optional editing `id` | Yes | Implemented in M2.5 |
| Menu | POST `/system/menu` | Vben menu form | **Missing** | Implemented in M2.6 |
| Menu | PUT `/system/menu/:id` | Vben menu form | **Missing** | Implemented in M2.6 |
| Menu | DELETE `/system/menu/:id` | id | **Missing** | Implemented in M2.6 |
| Role | GET `/system/role/list` | `page,pageSize,name,id,status,remark,startTime,endTime` | Yes | Implemented in M4 |
| Role | POST `/system/role` | `name,status,remark,permissions` | **Missing** | Implemented in M4 |
| Role | PUT `/system/role/:id` | partial update, including status | **Missing** | Implemented in M4 |
| Role | DELETE `/system/role/:id` | id | **Missing** | Implemented in M4 |
| User | GET `/system/user/list` | role-list filters plus `deptId`; `{ items,total }` | Yes | Implemented in M5 |
| User | POST `/system/user` | demo sends `name,deptId,status,remark,permissions` | **Missing** | Implemented in M5 with explicit `username/password/roleIds` RBAC adapter |
| User | PUT `/system/user/:id` | partial update, including status | **Missing** | Implemented in M5 |
| User | DELETE `/system/user/:id` | id | **Missing** | Implemented in M5 |

The menu form can submit `type`, `name`, `pid`, `meta.title`, `path`, `activePath`, `meta.icon`, `meta.activeIcon`, `component`, `linkSrc`, `authCode`, `status`, badge fields, keep-alive/affix flags, and hide flags. Menu types are `catalog | menu | embedded | link | button`; the incompatible three-value numeric model is intentionally replaced because menu data will be reinitialized.

### Playground examples (4)

| Method | Path | Decision |
| --- | --- | --- |
| GET | `/table/list` | Implemented in M7 with deterministic in-memory fixtures; no fake product table |
| POST | `/upload` | Implemented in M7 as authenticated, temporary local raster-image storage outside production; returns `{ url }` |
| GET | `/demo/bigint` | Implemented in M7 as an authenticated fixed raw-JSON contract fixture; no table |
| GET | `/status?status=...` | Implemented in M7 as a public non-production status simulator |

`GET /test` and `POST /test` are mock-only diagnostics and are not implemented. The download example calls an external static URL and is not a local backend endpoint. All retained M7 routes are registered by a dedicated Playground module only when `NODE_ENV` is not production; production additionally refuses `/uploads/*` static access. The local upload adapter accepts one JPEG/PNG/WebP image up to 6 MiB, identifies content by magic bytes, assigns a UUID filename, exposes it under `/uploads`, and removes artifacts older than 24 hours. It intentionally has no metadata table or deletion API because it is not a managed asset domain.

## Contract gaps in the existing backend

- Official Vben v5.7.0 uses a bare `baseRequestClient` for refresh and its mock returns a raw token. This project intentionally does not copy that exception: the backend keeps `ResOp<{ accessToken }>` and the project frontend's Hey API/OpenAPI wrapper plus `defaultResponseInterceptor` unwraps the `data` field. Contract tests must protect this project-specific adapter boundary.
- `/auth/codes` now returns cache-backed effective menu/button permission codes. Enabled ordinary roles contribute enabled assigned menu/button codes; enabled `super` receives all enabled codes. Role identities remain in `/user/info.roles`.
- `/user/info` previously exposed an entity-shaped object with `id`. M1.1 introduced a dedicated DTO, and M1.3 added persistent avatar, home-path, and description fields. The adapter now returns only `userId`, `username`, `realName`, `avatar`, `homePath`, `desc`, and `roles`; it deliberately does not echo an Access Token.
- `nestjs-paginate` returns a shape like `{ data, meta, links }`; Vben system tables expect unwrapped `{ items, total }` and use `page/pageSize`.
- M2 defines a fresh `sys_menu` shape and now exposes dynamic routes plus complete management list/existence/CRUD endpoints. Legacy menu data will be recreated rather than migrated; live PostgreSQL reinitialization remains a deployment action.
- Role and user management now provide transactional relationship writes and targeted cache/session invalidation.

## Real persistence and business rules

- Reuse `sys_user`, `sys_role`, `sys_menu`, `sys_user_role`, `sys_role_menu`, and `user_refresh_token`.
- Add a self-referencing `sys_dept` table and an indexed department foreign key on `sys_user`.
- User/profile persistence directly stores avatar, home path, description, timezone, and remark on `sys_user`; M6 owns timezone validation and preference endpoints.
- Model stable menu fields (`name`, `path`, `authCode`, `component`, `redirect`, `type`, `status`, `pid`) as columns. Prefer PostgreSQL JSONB for fast-moving Vben `meta`; promote only fields needing uniqueness, indexing, or domain queries.
- Treat role `permissions` as menu/button IDs stored through `sys_role_menu` and replace mappings transactionally.
- The official user demo also submits `permissions`, but this conflicts with the established user -> role -> menu model. Recommendation: keep role-based authorization and adapt the Vben user form to `roleIds`. If exact demo compatibility requires direct grants, first design `sys_user_menu` plus explicit union/override rules.
- Reject cyclic department/menu parents. Reject destructive deletes when children or active references exist. Protect the last super administrator and protected/default roles. Prefer soft deletion for users.
- Invalidate permission/menu/session caches only after successful commits and for all affected users.
- Do not create business tables for status, bigint, or generic table demos. File metadata needs a table only if product requirements include managed assets.

## Version-change management

- Store a machine-readable upstream lock with repository, stable tag, full SHA, collected paths, and collection time.
- Generate a contract snapshot from both frontend callers and mock handlers.
- On a new stable tag, classify diffs as additive, behavioral, breaking, removed, or mock-data-only.
- Use main only as a scheduled early-warning comparison, never to silently update production compatibility.
- Keep contract fixtures for the current and previous supported Vben stable baselines until all deployed frontends upgrade.
- Keep additive changes under `/api`; introduce `/api/v2` only for unavoidable breaking domain contracts, not for every Vben minor release.

## Implemented contract tooling

M0 now provides a deterministic schema-version-2 contract snapshot, frozen behavior fixtures, and four repository commands:

- `vben:contract:collect` regenerates the locked snapshot explicitly.
- `vben:contract:check` proves that the locked source still produces the committed snapshot and valid fixtures.
- `vben:contract:diff -- --ref <candidate>` classifies route, method, request, response, mock-coverage, and source-only changes without modifying the lock.
- `vben:contract:warn-main` compares the configured moving warning ref and exits with code 2 when drift is found.

The scheduled main warning is advisory: it can fail visibly, but it cannot update the production baseline. A stable-baseline change remains an explicit reviewed PR using the Vben upstream-upgrade template. At verification time, current `main` changed request signatures for `/auth/logout`, `/auth/refresh`, and `/upload`, response signatures for `/timezone/setTimezone` and `/upload`, plus upstream source data; this confirms why `main` must not be the compatibility lock.

## Response-envelope decision

`ResOp<T>` is the canonical backend JSON response format. Controllers return their business DTO and the global transform interceptor emits `{ code, data, message, success, traceId }`. The project Vben frontend generates types and calls from Swagger, then unwraps `data` centrally in its OpenAPI client. Consequently:

- no Vben endpoint should opt out of the transform merely to imitate `backend-mock`;
- `/auth/login` and `/auth/refresh` both expose `ResOp<LoginTokenResponseDto>` on the wire;
- contract tests assert both the business DTO and its `ResOp` envelope;
- any upstream raw-response special case is handled in the frontend adapter, not by fragmenting backend response conventions.

## Implemented refresh lifecycle

M1.2 keeps the existing JWT and Redis model but closes the refresh replay window. After signature/cache/database/expiry checks, one PostgreSQL `DELETE ... WHERE value = ?` is the single-use consumption point. Only a request whose delete affects exactly one row may create the replacement Refresh Token and Access Token. Logout now passes the HttpOnly cookie into the established login-state cleanup, revokes its PostgreSQL/Redis state, and clears it from the browser.

## Implemented effective permission resolution

M1.4 makes `/auth/codes` and `RbacGuard` use the same cache-backed resolver. A version-matching cached empty `codes` array is a real hit; missing, invalid, unknown-version, and legacy raw-array values trigger a PostgreSQL query and cache refill. This lazy cache-schema migration prevents forever-cached pre-M1.4 permissions from retaining the old filtering semantics. Permission rows are restricted to enabled roles and enabled menu/button records, deduplicated, and sorted. M2's fresh table makes each row hold one canonical `authCode`; no comma-splitting compatibility remains. Enabled `super` role assignments load every enabled menu/button permission code. A targeted invalidation method is available for the transaction-after-commit hooks required by M2, M4, and M5.

## Implemented fresh menu-model foundation

M2.1–M2.2 use one Vben-native menu model rather than maintaining an old domain shape plus a translation adapter. Shared types cover `catalog`, `menu`, `embedded`, `link`, and `button`, numeric `0 | 1` status, and extensible route metadata. Dedicated request/response DTOs remain necessary for validation and Swagger, while the later service layer will build trees and handle the two form-only compatibility fields `activePath` and `linkSrc`.

The fresh `sys_menu` stores only `pid`, `name`, `path`, `auth_code`, `type`, `component`, `redirect`, `meta`, and `status` beyond common audit fields. PostgreSQL JSONB absorbs Vben display/route metadata that does not require a relational constraint or index. Unique indexes protect name, non-null path, and non-null authCode; checks protect the five types and numeric status; the self-FK restricts parent deletion. There is deliberately no legacy migration or comma-separated permission compatibility. Existing menus and role-menu mappings must be recreated through the database bootstrap process.

## Implemented dynamic menu resolution

M2.3 publishes authenticated `GET /menu/all` at the root runtime path rather than under `/system`. Ordinary users resolve direct grants through enabled roles; enabled `super` receives all enabled menus without role-menu rows. The resolver computes the complete ancestor closure from the enabled menu set, so a directly granted route or button can make its required route parents visible. A branch is emitted only when it reaches a valid root, and buttons, missing-path nodes, disabled/missing ancestors, and cycles cannot leak into the route tree. Route objects contain only Vben runtime fields and are recursively sorted by numeric `meta.order` then globally unique `name`.

`sys_role_menu` now uses bigint foreign keys, indexed columns, a unique role/menu pair, cascading role deletion, and restrictive menu deletion. This matches the fresh-table decision; no compatibility migration is provided. Later M2 batches completed existence checks, CRUD validation, transactional writes, and menu-write cache invalidation.

## Implemented system menu tree

M2.4 publishes permission-protected `GET /system/menu/list`. Unlike the runtime tree, the management tree includes every non-deleted type and both numeric statuses, while projecting only the Vben contract rather than serializing entities. Bigint IDs remain strings, optional route fields and arbitrary public metadata survive, and `meta.activePath` is also emitted as the top-level compatibility field read by the v5.7.0 edit form.

Fresh-table constraints should prevent missing parents, and the later write service will reject cycles. The read path is still defensive: missing/self parents become roots, and each existing cycle has one deterministic parent link broken by `meta.order` then unique `name`. This guarantees every stored record appears exactly once and JSON serialization cannot recurse forever.

## Implemented menu existence checks

M2.5 publishes the two Vben form validators at `GET /system/menu/name-exists` and `GET /system/menu/path-exists`. Both use the existing menu-list permission and the canonical `ResOp<boolean>` response. Required lookup values and optional positive bigint-string edit IDs are validated before the service queries PostgreSQL; an edit ID adds `id != :editingId`, so the current row does not reject its unchanged value. Values intentionally retain exact, case-sensitive semantics. TypeORM's normal repository scope excludes soft-deleted rows, and the three menu uniqueness constraints are partial indexes over `deleted_at IS NULL`, so a false precheck cannot become a uniqueness failure solely because a deleted row retains that value.

`MenuModule` remains reachable through `AuthModule`, which imports its exported `MenuService` for permission resolution and registers its controllers. The extra direct `AppModule` import introduced during M2.3 was therefore removed; controller metadata continues to define root `/menu/all` and `/system/menu/*` paths.

## Implemented menu write boundary

The locked v5.7.0 form requires a title for every type, a route path for catalog/menu/embedded, a component for menu, an HTTP(S) target for embedded/link, and an auth code for button. It moves `linkSrc` into `meta.iframeSrc` or `meta.link` before submission; the backend also accepts the compatibility field and performs the same mapping. Link paths remain optional because the locked create form does not expose that field, while an existing path is preserved on update.

Menu writes use serializable transactions. Parent traversal locks and validates the complete ancestor chain, restricts parents to catalog/menu nodes, and rejects self/descendant cycles. Leaf conversion and deletion check active children; deletion additionally rejects active `sys_role_menu` references and uses soft deletion so the M2.5 partial unique-index semantics remain consistent. PostgreSQL uniqueness and serialization errors are translated to stable HTTP conflicts because frontend existence checks cannot prevent concurrent races.

After a successful commit, the write service invalidates only permission caches for users reached through the edited/deleted menu's enabled role mappings and users assigned the enabled `super` role. Creation has no ordinary role mapping yet, so it invalidates super users only. The query runs inside the transaction to capture the committed write's affected-user set, while Redis deletion runs after the transaction resolves; it uses the shared cache/key primitives directly and introduces neither a broad Redis scan nor an `AuthService`/`MenuService` circular dependency.

## Implemented department boundary for M3

The locked v5.7.0 department form submits `name`, optional `pid`, numeric `status`, and optional `remark`; the list additionally consumes `id`, `createTime`, and recursive `children`. The backend adds `order`/`order_no` because deterministic business ordering is useful even though the stock form does not expose it. `order` is optional at the API boundary and defaults to zero. Sibling names, including root names, are unique among non-deleted records.

The user explicitly owns database creation, so M3 changes only TypeORM entity mappings and application behavior: no migration or DDL execution. `sys_user.dept_id` is nullable, indexed, and restrictive. Department writes use serializable transactions and validate the full parent chain. Delete is a soft delete rejected by active child or any persisted user reference, including soft-deleted users so later restoration cannot produce a dangling logical reference. Changing a department's numeric status has no cascade semantics; descendants and users remain unchanged.

The management query projects entities rather than serializing relations, preserves bigint strings, maps `createdAt` to `createTime`, and recursively sorts by `order/name/id`. Defensive normalization promotes orphans and self-links to roots and deterministically opens historical cycles, so malformed pre-existing data cannot disappear or produce cyclic JSON. DTO and service validation accept only numeric `0 | 1`, enforce PostgreSQL bigint range at the write boundary, and map unique, foreign-key, serialization, and deadlock races to stable HTTP 409 responses.

## Implemented role boundary for M4

The locked v5.7.0 role page sends `name`, numeric `status`, optional `remark`, and a `permissions` array of menu IDs. Its grid requests `page/pageSize` plus optional `name`, `id`, `status`, `remark`, `startTime`, and `endTime`, and consumes `id/name/status/remark/createTime/permissions` inside the project's approved `{ items,total }` pagination shape. The status switch performs a partial PUT containing only `status`, so update fields must remain independently optional.

The backend adds `code` as an immutable authorization identity separate from editable `name`. Create may supply a constrained custom code; omission generates `role:<uuid>`. Public creation cannot claim the reserved `super`, `admin`, or `user` codes, while deployment setup creates the built-in super role directly. Codes remain unique across soft deletion so identity is never silently recycled; display names are unique only among non-deleted roles. `is_default` is deployment-owned and returned for administrative visibility, but is not writable through the Vben CRUD contract.

Role writes use serializable transactions and lock the current role. A supplied permission array is normalized as PostgreSQL bigint strings, every referenced non-deleted menu is locked and validated, then `sys_role_menu` is replaced atomically; omitted permissions on partial update preserve current mappings. Roles identified by `code=super` or `is_default=true` cannot be disabled or deleted. Other status changes do not rewrite user-role rows or user status. Delete also rejects any persisted user-role reference and hard-removes now-unreferenced role-menu mappings before soft-deleting the role.

Every successful update gathers distinct active assignees inside the transaction and deletes only those users' effective-permission cache keys after commit. Create has no assignees, and a deletable role is required to have none. M4 changes TypeORM mappings and behavior only; the deployment owner creates/rebuilds role tables and no migration or DDL is generated.

## Browser security deployment model

M1.5 replaces credentialed wildcard CORS and fixed Cookie attributes with one environment-backed browser-security configuration. Local/development defaults cover the locked Vben playground (`5555`) and Ant Design Vue app (`5999`); production requires explicit HTTPS origins and an HTTPS public API URL. Refresh Cookies are host-only by default, scoped to the API auth path, Secure in production, and SameSite=Lax unless explicitly changed. Cross-site SameSite=None is valid only with Secure enabled.

CORS alone does not prevent a cross-site form from causing a state change, so a global guard validates the exact browser Origin for every non-safe HTTP method before JWT and business guards. Trusted configured origins pass; unknown origins receive HTTP 403. Requests without Origin remain supported for CLI and service-to-service clients. Login, rotation, and clearing all use the same Cookie path/domain/security attributes.

## Disabled users and password-hash transition

M1.6 rejects `status=false` only after the submitted password has verified. Unknown users and wrong passwords keep the generic credential error, while a correctly authenticated disabled user receives the dedicated disabled-account error before any token, login cache, or success log is created. Internal validated login data removes both `password_hash` and `psalt`. This check gates new logins; M5 status writes still need transactional revocation and cache invalidation for already-issued sessions.

The original plan assumed in-place salted-MD5 migration, which would have required a mixed verifier because hashes cannot be converted without plaintext. The M5 deployment instruction instead rebuilds the user table, so no legacy rows, mixed verifier, rollout counters, or schema migration remain in scope. Fresh credentials are Argon2id-only, and production must still benchmark parameters at or above current OWASP guidance.

## Implemented user boundary for M5

The locked v5.7.0 user grid requests `page/pageSize/name/id/status/remark/startTime/endTime/deptId` and consumes Vben fields such as `id/name/status/remark/createTime/deptId`. Its type declares `permissions`, but the actual form schema does not bind that field even though the drawer contains an unused menu-tree slot. Reusing that ambiguous field for direct menu grants would conflict with the established user → role → menu model. M5 therefore adds explicit `roleIds`; it also adds required create-only `username/password`, keeping immutable login identity separate from editable Vben display `name`.

The user's deployment instruction supersedes the earlier mixed-hash migration plan: `sys_user` is recreated as an Argon2id-only table, so M5 removes `psalt`, legacy MD5, and the redundant `role` column without generating migration or DDL. Passwords use PHC strings and an explicit `password_algorithm=argon2id` marker. The default `m=19456,t=2,p=1` meets the current OWASP minimum, remains environment-tunable above that floor, and was smoke-benchmarked locally; production-class hardware must still select its final cost before rollout.

User writes use serializable transactions. Create validates and locks one enabled department and every enabled role before saving the Argon2id hash and role mappings. Partial PUT preserves omitted roles and credentials; submitting `roleIds` hard-replaces mappings, while submitting `password` resets the hash and increments `session_version`. Disable, password reset, and delete remove persisted Refresh Tokens and invalidate token/session state after commit. Every update deletes the targeted user-info and permission caches.

An enabled user who currently holds the enabled `super` role cannot be disabled, deleted, or have that role removed unless another enabled super user exists. The predicate is evaluated inside the serializable transaction with read locks so concurrent attempts cannot remove both administrative paths. Delete hard-removes user-role mappings and soft-deletes the user, allowing the active-only username index to support intentional reuse by a new identity.
