# Stack Profile

<!-- kuvibe: template=stack-profile revision=1 ownership=mixed -->

## Detected facts

| Area | Choice | Evidence | Confidence |
| --- | --- | --- | --- |
| Language/runtime | TypeScript ESM on Node.js | root and `packages/core/package.json` | High |
| Backend | NestJS 12 with Fastify 5 | `packages/core/package.json`, `src/main.ts` | High |
| Persistence | TypeORM with PostgreSQL; MySQL driver is also installed | database config and dependencies | High |
| Cache/session state | Redis/ioredis | shared cache modules and dependencies | High |
| Authentication | Passport JWT, database refresh tokens, Redis access-token state | auth module/services/entities | High |
| Authorization | User-role-menu RBAC | `sys_user_role`, `sys_role_menu`, `sys_menu` | High |
| API contract | Swagger/OpenAPI plus global `{ code, data, message, success, traceId }` envelope | common decorators/interceptors | High |
| Package manager | pnpm 11 workspace-style repository | lockfiles and package manager fields | High |
| Tests | Jest/Supertest | core manifest and test config | High |
| Docs | VitePress Markdown | `docs/package.json`, `.vitepress/config.mts` | High |

## Required engineering rules

- Use explicit DTOs at public API boundaries; do not expose TypeORM entities as a long-term external contract.
- Generate schema evolution through reversible TypeORM migrations; do not depend on synchronize in production.
- Keep authorization-changing writes transactional and invalidate affected Redis permission/session caches after commit.
- Preserve bigint identifiers as strings at JSON boundaries.
- Run focused tests before broader build/lint/e2e verification.
- Keep Swagger current whenever public request or response contracts change.

### 实体列类型规范（TypeORM / PostgreSQL）

- 新增或修改实体列时，显式声明数据库 `type`，不依赖 TypeScript 装饰器元数据推断；普通列及主键、日期等专用列装饰器均应遵循其支持的显式类型写法。
- `string | null` 等联合类型的运行时元数据可能退化为 `Object`，导致 `DataTypeNotSupportedError`；可空、枚举、数组和 JSON 列尤其不能依赖隐式推断。
- 按存储语义选择类型，如 `varchar`（同时指定长度）、`text`、`integer`、`boolean`、`timestamptz`、`jsonb`；枚举、数组等同时显式配置相应列选项。
- `nullable: true` 表示数据库允许 `NULL`；`?` 表示 TypeScript 属性可缺省，不能替代数据库约束。实体可空字段优先使用 `T | null`，仅在确有缺省语义时使用 `?`；更新 DTO 可用 `?` 表达“不修改该字段”。

```ts
@Column({ type: 'varchar', length: 50, nullable: true })
remark: string | null

@Column({ type: 'integer', default: 0 })
order: number
```

## Conditional capabilities

- Vben compatibility work must compare frontend API callers, system-page form schemas, shared Vben types, and backend mock routes at the same immutable upstream commit.
- File upload work requires an explicit storage-provider and security design.
- Breaking public contracts require a migration/compatibility plan and human approval.

## Explicit exclusions

- Do not treat upstream mock data as a production domain model.
- Do not add database tables for Vben demonstration-only status, bigint, or generic table fixtures.
- Do not replace the established stack during ordinary Vben compatibility work.
