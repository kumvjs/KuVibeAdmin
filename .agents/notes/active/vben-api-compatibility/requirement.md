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
- M7's table, bigint, and status examples remain playground-only. The original temporary-upload scope is superseded by M7.1: production-capable system attachment management, database-backed cached upload policies, and authorized downloads. New attachment tables are deployment-owned; no migration or legacy-file conversion is required.

## System attachment requirement (M7.1)

- Move `POST /upload` out of Playground into a reusable system module for avatars and business attachments; preserve the canonical JSON response envelope and explicitly test frontend compatibility.
- Support common image, document, archive, and media formats through configurable allowlists and size limits, not environment-only business settings. Persist policies and attachment metadata, provide permission-controlled management, and reuse Redis so cache hits do not query policy tables.
- Support authenticated and object-authorized downloads. Approved security default: private files; explicitly approved business purposes may publish public images. Possession of an attachment ID is not download permission.
- This is a new feature: the deployment owner creates its tables. Explicitly declare every entity column's database type. Do not generate migrations or delete/convert existing temporary files implicitly.
- Approved defaults, security boundaries, cache consistency, and completed delivery are in [attachment-design.md](attachment-design.md). M7.1 includes production upload/download, attachment administration, persistent audit, trusted business binding, avatar integration, and reference-aware cleanup. Browser-driven Vben/complete login verification remains M8.

## M6 完成范围

展示偏好默认跟随设备；业务多时区和权益绑定由业务实现。后端提供可复用纯时间工具，不猜测默认业务时区。用户明确不要求开发阶段历史迁移，且 timestamptz 不设置 precision。当前范围不修改相邻 Vben 仓库或原列表查询语义。
