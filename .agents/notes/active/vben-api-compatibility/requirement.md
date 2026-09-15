# Vben API Compatibility Requirement

## Outcome

Establish the authoritative Vben API scope and implement the versioned backlog in small, independently verified batches for a real NestJS/PostgreSQL/Redis backend.

## Actors and affected modules

- Vben Admin runtime and playground system-management frontend.
- Existing auth, user, role, menu, Redis cache, TypeORM migration, and Swagger modules.
- Planned department, user-preference/timezone, and optional upload capabilities.

## Constraints

- Existing login, refresh, logout, access-code, user-info, and system-user-list work must be reused and contract-tested, not blindly rewritten.
- Implement one coherent milestone slice per batch and update `plan.md` only for work that has actually passed verification.
- A route returning mock-shaped data is not complete: production work needs schema, constraints, transactions, authorization, cache invalidation, error behavior, migrations, and tests.
- Swagger/OpenAPI remains the endpoint reference; these artifacts hold research, decisions, and TODOs only.
- Upstream selection must support deterministic builds and future API-change detection.
- Preserve the backend's global `ResOp<T>` wire envelope for every JSON endpoint, including `/auth/refresh`. The project frontend uses its generated OpenAPI client plus the response interceptor to unwrap `data`; upstream mock responses are evidence, not authorization to bypass the backend envelope.

## Completed M0 foundation boundary

- M0 changes only contract collection, comparison, fixtures, and upgrade governance; it does not implement controllers, services, entities, or migrations.
- Vben source is fetched into a temporary checkout and is neither vendored nor installed as a runtime dependency.
- Demonstration-only endpoints do not receive database tables.
- Existing authentication remains untouched until M1 contract tests prove a compatibility defect.

## Assumptions

- The target is Vben Admin 5.x and includes the official playground system-management pages, not only a minimal UI variant.
- The existing role-based RBAC remains the preferred authorization model.
- M5 resolves the upstream user `permissions` ambiguity in favor of the existing RBAC model: management requests use explicit `roleIds`, and no direct per-user menu grants are persisted.
- The deployment owner will create the redesigned user tables directly. M5 must not generate a migration or retain legacy MD5 rows in the fresh schema.
- M7 is playground-only: its module and temporary uploads are unavailable in production, and demonstration data must not become a business table or managed asset domain.
