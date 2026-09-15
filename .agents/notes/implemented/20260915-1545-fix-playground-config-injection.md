# Fix Playground configuration injection

Timestamp: 2026-09-15T15:45:44+08:00

## Problem and decision

Starting the non-production Playground module failed with `UnknownDependenciesException`: `PlaygroundUploadService` injected the `APP_CONFIG` factory rather than its registered provider token, `APP_CONFIG.KEY`.

Use the same `.KEY` convention as existing auth services. AppModule already registers app configuration globally, so no additional module imports or duplicate factory providers are needed. Preserve all unrelated in-progress M7 and editor changes.

## Implementation and verification

- Corrected the upload service constructor injection token.
- Added a Nest TestingModule regression test that loads the real PlaygroundModule with global ConfigModule registration, without mocking upload dependencies. Existing upload tests manually constructed the service and therefore could not detect this error.
- Confirmed the new test fails with the reported exception before the fix and passes afterward. Compilation tests dependency resolution without invoking filesystem lifecycle hooks.
- Playground tests: 5 suites, 16 tests passed.
- Full Jest run: 36 suites, 196 tests passed.
- TypeScript test type-check, Nest build, and changed-source ESLint passed.

## Impact and follow-up

No API, database, upload behavior, or production exposure changes; public documentation impact is N/A. Updated active M7 plan and acceptance evidence. Full application startup with PostgreSQL/Redis and real HTTP upload remains outside this focused verification.
