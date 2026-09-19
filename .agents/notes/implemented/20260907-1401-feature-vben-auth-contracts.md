# Vben Authentication Contracts — Batch M1.1

Timestamp: `2026-09-07T14:01:02+08:00`

## Problem and context

The existing authentication implementation already handled login, refresh-token rotation, logout invalidation, and current-user lookup, but those behaviors had no executable Vben-facing contract tests. The upstream mock returns a raw token for refresh, while this project's backend consistently uses `ResOp<T>` and its frontend generates an OpenAPI client that unwraps `data` centrally.

## Decision

- Preserve `ResOp<T>` for every JSON response, including `/auth/refresh`.
- Treat the project frontend's generated OpenAPI client as the adapter for upstream raw-response differences.
- Test existing authentication controller behavior without replacing JWT, refresh-token, or logout logic.
- Replace `/user/info` entity spreading with a dedicated, explicit Swagger response DTO.

## Alternatives

- Adding `SkipResponseTransform` to refresh was rejected because it would fragment the backend contract and contradict the established OpenAPI-client integration.
- Returning the complete user entity was rejected because it leaks persistence and audit fields and does not provide Vben's `userId` name.
- Inventing empty avatar/home-path/profile values was rejected; those fields remain pending until M5 provides real persistence.

## Constraints

- Existing login, JWT signing, refresh rotation, Redis state, RBAC, and logout invalidation must be reused.
- Bigint user IDs must remain strings at the public boundary.
- Swagger remains the canonical endpoint schema.

## Implementation

- Added focused Jest contracts for login, refresh, missing refresh cookie, logout, and current-user information.
- Added `UserInfoResponseDto` and mapped only `userId`, `username`, `realName`, and role codes.
- Updated the frozen refresh fixture to `ResOp<{ accessToken }>`.
- Added a test-specific TypeScript configuration and Jest module mappings for the project's ESM-style `.js` imports.
- Added a compile-time `#/* -> src/*` path mapping and loaded `@fastify/cookie` type augmentation explicitly; application runtime module resolution remains unchanged.

## Verification

- Focused Jest: 2 suites and 5 tests passed.
- `tsc -p packages/backend/tsconfig.spec.json --noEmit` passed.
- Focused ESLint passed.
- Nest application build passed.
- Locked Vben snapshot and frozen fixtures passed `vben-contract check`.
- `git diff --check` passed.

The package-manager shim could not run the requested pnpm version because its registry signature/version-switch fetch failed, so verification used the already installed repository binaries directly.

## Documentation impact

Swagger now declares `/user/info` with `UserInfoResponseDto`. Existing API and auth/RBAC documentation was updated to describe `data.accessToken`, OpenAPI-client unwrapping, and the `userId` mapping. No parallel API document was added.

## Consequences and follow-ups

The first M1 contract-test item is complete. Token rotation/replay and logout-cookie/session integration still need database/Redis-backed tests before their plan item can be checked. Avatar, home path, and description remain deliberately absent until real profile persistence is designed.
