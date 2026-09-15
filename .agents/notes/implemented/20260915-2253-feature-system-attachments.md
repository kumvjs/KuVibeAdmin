# Complete M7.1 system attachment management

Timestamp: 2026-09-15T22:53:50+08:00

## Requirement and scope

The user requested completion of the entire M7.1 milestone: production system uploads rather than a removable demo, configurable multi-format policies cached in Redis, authenticated downloads, managed metadata/references, and fresh tables without migrations. Approved private-by-default access with explicitly public business avatars and local storage first.

## Implementation and decisions

- Added streaming local storage outside the webroot, bounded content validators for thirteen formats, image decode/re-encode and configurable dimensions, and an explicitly unscanned default scanner provider. Added file-type 22.0.2, sharp 0.35.4 and yauzl 3.4.0 with locked dependencies.
- Added authenticated upload (HTTP 200 / ResOp / url), object-authorized binary downloads, controlled public avatar images, administrator pagination/detail/download/delete, and durable upload/download-authorization audit records.
- Added trusted business registry/bind/unbind with default-deny unknown types. Avatar binding preserves existing profile URL fields; legacy avatar updates and user deletion release old references transactionally. Direct system download URLs cannot bypass binding via the old profile writer.
- Added pending/ready/deleting/deleted lifecycle, compensation, bounded periodic cleanup, row-lock reference checks, SKIP LOCKED coordination, and physical deletion retry. Files with live references cannot be deleted merely due to age.
- Removed the superseded Playground upload service, its old storage tests and controller methods/constants/DTO. Kept demo table/bigint/status. Existing uploaded files were not deleted or migrated; source removal can be recovered with Git. Old upload static access is disabled.
- Preserved the policy foundation's Redis generation fencing and bounded stale-cache semantics. New sys_attachment_audit brings fresh attachment tables to four. No production database DDL or migrations were run.

## Bugs caught during verification

- Multipart limit handling could destroy a file stream while pending-record creation was awaiting the database. Attaching pipeline after that close event waited until timeout. Storage now checks destroyed streams before and after async setup; rejection and compensation have regression coverage.
- Aligned POST runtime status with ApiResult's Swagger HTTP 200 contract and verified generated OpenAPI.
- Ensured a download descriptor is destroyed if its surrounding database transaction fails to commit.

## Verification

- Full Jest: 40 suites / 233 tests passed; PostgreSQL metadata, Nest dependency resolution, DTO/domain, cache failure/race, streaming/path safety and existing domain regressions included.
- 19 isolated integration checks passed under NODE_ENV=production, with real PostgreSQL 17.11, Redis 8.2.9, Fastify, signed test bearer tokens and the real RBAC guard. Includes real Lua refill/TTL, all thirteen formats, spoofing rejection, file/database failure compensation, actual FK/unique/check failures, business rollback, reference/cleanup concurrency, public/private downloads, and Swagger.
- TypeScript test type-check, changed-code ESLint (including the ESM integration entrypoint), Nest build, VitePress build, locked Vben v5.7.0 snapshot/fixtures and contract-tool tests, and diff checks passed.
- Integration scripts create and remove only a random test schema, Redis prefix and temporary directory. Tests do not exercise the complete login/Passport session pipeline or a browser-driven Vben flow; those remain M8.

## Documentation and operational follow-up

Updated active requirement/design/analysis/acceptance/plan, module overview, data/cache docs, Vben/API notes and VitePress navigation; added docs/modules/attachments.md. Active artifacts stay because the broader Vben work is unfinished.

Deployment owns creating four tables, explicitly initializing upload policies, persistent/shared storage, proxy upload limits and rate/capacity controls. Default scanner is unscanned, not a claim of malware safety; deployments requiring antivirus must replace the provider. No object-storage driver, chunked upload, public sharing links, or generic document preview was added.
