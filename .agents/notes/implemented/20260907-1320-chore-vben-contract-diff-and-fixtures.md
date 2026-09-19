# Vben Contract Diff and Fixtures — Batch M0.2

Timestamp: `2026-09-07T13:20:45+08:00`

## Problem and context

M0.1 made the Vben v5.7.0 inventory reproducible, but it could not classify a candidate version, warn about upstream development drift, or freeze the response behaviors that later implementation batches must preserve.

## Decision

- Extend the collector with read-only candidate diffing for routes, methods, request signatures, response signatures, mock coverage, and source-only changes.
- Keep `main` as a scheduled/manual early-warning ref only; never let it update the stable lock automatically.
- Freeze representative response and edge-case fixtures separately from the generated endpoint inventory.
- Require compatibility, persistence/migration, rollout, support-window, verification, and rollback decisions in every upstream-baseline upgrade PR.

## Alternatives

- Comparing only route names was rejected because request and response generic/config changes can break the frontend without changing a URL.
- Automatically advancing the stable lock from `main` was rejected because `main` is moving unreleased state.
- Treating mock-data edits as API breaks was rejected; they are reported separately so maintainers can judge whether behavior changed.

## Constraints

- No existing login, JWT, RBAC, controller, service, entity, migration, or Swagger implementation may change in M0.
- Candidate comparison must tolerate source paths removed by a future upstream version while strict locked-baseline checks must still reject missing paths.
- Temporary clones must be shallow, filtered, sparse, and cleaned up by the collector.

## Implementation

- Upgraded the generated snapshot to schema version 2 with normalized request/response signatures and mock-handler hashes.
- Added `diff` and `warn-main` commands plus text/JSON output.
- Added frozen fixtures for success/error envelopes, Vben pagination, 401/403, refresh cookies/raw tokens, dynamic routes, and bigint string serialization.
- Added parser/diff tests, a weekly/manual warning workflow, and an upstream-upgrade PR template.
- Added package scripts for candidate diff, contract tests, and main warning.

## Verification

- `node --check scripts/vben-contract.mjs`
- `node --test scripts/vben-contract.test.mjs` — 3 tests passed.
- Locked local-source check passed and validated all frozen fixtures.
- `diff --ref v5.7.0` against the same source reported no changes.
- `warn-main --ref main` detected current upstream drift and exited with code 2 as designed. It reported request changes for `/auth/logout`, `/auth/refresh`, and `/upload`; response changes for `/timezone/setTimezone` and `/upload`; and 25 source changes.
- `git diff --check`
- Confirmed `docs/frontend/vben.md` and `packages/backend` were unchanged.

## Documentation impact

Swagger/API documentation: N/A. No runtime API changed, and no parallel endpoint Markdown document was introduced.

## Consequences and follow-ups

M0 is complete. Future stable Vben upgrades can now be reviewed without silently changing production compatibility. The next implementation batch is M1 and should begin with contract tests around the already implemented authentication endpoints; production logic should change only where those tests demonstrate an actual compatibility gap.
