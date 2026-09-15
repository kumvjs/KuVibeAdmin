# System attachment entity and upload-policy foundation

Timestamp: 2026-09-15T17:15:11+08:00

## Context and decision

The user reclassified POST /upload as a production system capability, requiring configurable formats/limits, cached settings, private authorized downloads, and attachment management. Approved default-private access with explicitly public business images and local storage first. New tables are deployment-owned; no migration.

Follow the repository's independently verified batch workflow. This first slice adds the data/policy foundation and preserves the working Playground upload until a replacement is verified. It does not claim to finish M7.1.

## Implementation

- Added UploadModule at the application root and explicitly typed sys_upload_policy, sys_attachment, sys_attachment_reference entities with audit fields, indexes, checks and restrictive attachment references.
- Added validated, Swagger-described policy read/full-replacement endpoints with separate RBAC permissions and the canonical JSON envelope; no public exposure or environment-driven business settings.
- Policy rows are created through explicit management requests; missing/disabled policies never become unrestricted defaults. Public policy is limited to avatar image formats.
- Reused the shared Redis client with isolated cache keys, generation-fenced Lua refill, 60-second bounded TTL, negative caching, per-process request coalescing, post-commit invalidation retries, and rate-limited fallback. Generic getOrSet was not used because it does not fence a loader racing with an update.
- Cache failure after a committed write returns an explicit saved-but-refresh-failed 503 and logs the bounded stale window. No false database/Redis atomicity claim.

## Verification

- Focused Jest: 4 suites, 32 tests passed (DTO/domain rules, entity PostgreSQL metadata, Nest dependency injection, cache races/failures and transactional sequencing).
- Full Jest: 40 suites, 233 tests passed.
- tsc -p tsconfig.spec.json --noEmit, changed-code ESLint, Nest build and git diff --check passed.
- No database connections/DDL, live Redis Lua execution, HTTP authorization end-to-end test, or file deletion was performed. Redis server executable is unavailable locally; live-service integration remains a release gate.

## Documentation and next batch

Updated active requirement/design/plan/acceptance and current data/cache and module-overview documentation. Preserve the active work directory because M7.1 is unfinished.

Next: implement streaming content-validated storage and POST /upload replacement, authenticated object-authorized downloads, business binding including avatars, reference-aware cleanup, and integration/HTTP contracts. Format configuration is not evidence that file validators or production file operations already exist.
