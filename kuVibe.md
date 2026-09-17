# KuVibe — Coding Agent Software Engineering Bootstrap Specification

<!--
kuvibe:
  version: 0.3.3
  projectSchema: 2
  minimumSupportedProjectSchema: 1
-->

## 1. KuVibe Identity

**Ku is Cool.** Ku 表达“酷 / Cool”，Vibe 来自 Vibe Coding。KuVibe is a file-first software engineering protocol: the user states intent, while the coding agent supplies context retrieval, focused clarification, engineering analysis, planning, verification, living documentation, and durable engineering memory.

KuVibe is open source: [github.com/kumvjs/KuVibe](https://github.com/kumvjs/KuVibe). Visit the repository for the latest protocol, documentation, and updates. If KuVibe helps you, star the project, share it with others, or contribute ideas, issues, and improvements.

This file is the user interface. Never require the user to install a CLI, learn workflow commands, classify their task, select capabilities, or manage skills.

## 2. User Experience Contract

- Accept natural-language requirements.
- Hide routine workflow mechanics while making material decisions visible.
- Inspect existing evidence before asking questions.
- Ask only questions whose answers materially change the result.
- Continue safely when optional tools, runtimes, networks, or integrations fail.

## 3. Core Engineering Principles

1. Do not immediately implement a meaningful raw requirement.
2. Existing repository evidence and safe conventions beat generic preferences.
3. Established technology choices stay stable during normal work.
4. Load the least context needed to reach adequate confidence.
5. Use task-relevant perspectives, not fixed agent bureaucracy.
6. Current truth belongs in docs; historical decisions belong in timestamped notes.
7. Optimize every artifact for the next agent inheriting the repository.

## 4. Version and Bootstrap Detection

Read this file's `kuvibe` metadata, then inspect `.agents/kuvibe.yaml` before normal requirement work. Also check the legacy harness markers `AGENTS.md`, `.agents/project.md`, and `.agents/context/stack.md`.

- No state file and no harness markers: **Bootstrap**.
- No state file but any harness marker exists: **Legacy Adoption**. Never infer a fresh project merely because version metadata is absent.
- Invalid or internally inconsistent state: stop version writes, report the evidence, and preserve the existing harness.
- Recorded schema is below `minimumSupportedProjectSchema`: **Unsupported Migration**; obtain the missing official consecutive migration specifications before changing files.
- Recorded schema is below `projectSchema`: **Migration**.
- Schemas match and recorded release is older: **Refresh**.
- Schema and release match: **Maintenance**.
- Recorded schema or release is newer: **Unsupported Downgrade**; do not rewrite state or templates with this older protocol.

Schema comparison decides structural migration. SemVer describes the protocol release and never implies migration by itself. Compare SemVer numerically, not lexically.

### 4.1 Project Version State

After a successful bootstrap or upgrade, maintain `.agents/kuvibe.yaml` separately from project knowledge:

```yaml
kuvibe:
  version: 0.3.3
  schema: 2
templates:
  agents-router: 1
  requirement-workflow: 3
  development-workflow: 3
  review-workflow: 1
  documentation-workflow: 1
initializedAt: <ISO-8601 timestamp with offset>
lastUpdatedAt: <ISO-8601 timestamp with offset>
```

Preserve `initializedAt` on upgrades. Update `lastUpdatedAt`, release, schema, and applied template revisions only after relevant validation succeeds. Metadata is system state, not a substitute for Git history or project documentation. Keep this file limited to KuVibe system metadata; Project Language and other project conventions belong in `.agents/project.md` or `.agents/context/conventions.md`, never in `.agents/kuvibe.yaml`.

### 4.2 Ownership and Modification Safety

Classify before changing an existing artifact:

- **KuVibe-owned**: unmodified workflow templates and managed blocks may be refreshed automatically.
- **Mixed**: context files and customized managed artifacts may only be merged; preserve project-specific content.
- **Project-owned**: `.agents/project.md`, `.agents/notes/**`, and real project documentation must not be regenerated, overwritten, or deleted by an upgrade.

A template revision only identifies a refresh candidate; it does not prove the file is unmodified. Use managed-block boundaries, metadata, Git evidence, and content comparison. If provenance or modification status is uncertain, treat the artifact as mixed.

For deletion, prefer merge, then deprecation, then deletion. Delete only when the artifact is KuVibe-owned, contains no project customization, its useful content has moved, and the migration specification explicitly permits deletion. Otherwise retain it with a deprecation notice.

### 4.3 Managed Metadata and Blocks

Managed Markdown templates carry hidden metadata with `template`, integer `revision`, and `ownership`. Mixed files such as `AGENTS.md` use bounded regions:

```text
<!-- kuvibe:managed:start template=agents-router revision=1 -->
...managed routing instructions...
<!-- kuvibe:managed:end -->
```

Refresh only that region. Content outside it is project-owned.

### 4.4 Refresh

When schemas match and this release is newer, inspect template revisions and refresh only affected KuVibe-owned content or managed blocks. Merge customized/unknown content. Do not run structural migrations, rewrite project knowledge, or touch historical notes. When merging version conventions, apply section 30.1 evidence requirements: preserve supported policies, correct unsupported inferred exceptions narrowly, and retain historical notes. Validate references, then update state and record a note when the refresh materially changes behavior.

### 4.5 Migration

Run explicit, consecutive schema migrations only: `1 -> 2 -> 3`, never an invented `1 -> 3`. Before editing, inspect relevant Git status/diffs without cleaning or resetting the worktree. For each step:

1. Load that transition's specification from this file's supported migration index; repository maintainers use the expanded canonical copy under `migrations/`.
2. Inventory affected files and ownership, and record preservation requirements.
3. Apply the smallest additive or merge-safe changes.
4. Validate the transition, including retained project docs and notes.
5. Stop on failure and report completed and pending steps; do not advance schema state.

After all steps pass, write one timestamped migration note and then update `.agents/kuvibe.yaml`. Git is the recovery mechanism; do not create backup-directory clutter.

### 4.6 Supported Migration Index

**Schema 1 -> 2 (pre-versioning harness adoption):** Schema 1 is the implicit layout used before `.agents/kuvibe.yaml` existed. Preserve all existing project/context/docs/note content. Add the state file. Convert an unmodified generated `AGENTS.md` router to the managed block format; otherwise preserve its content and add or merge only the bounded router block. Add current template metadata to unmodified workflows; treat customized or uncertain workflows as mixed and merge current requirements without replacing their rules. Ensure requirement routing performs the version check before normal work. Validate all required harness files, managed-block boundaries, readable project context, valid state values, and unchanged historical notes/project documentation. Only then record the schema-1-to-2 migration note and set schema `2` and release `0.2.0`.

After the historical schema-1-to-2 adoption step above, apply any remaining same-schema refresh to this protocol's current release and managed revisions before recording final installed state.

## 5. Greenfield Bootstrap

Infer Project Language from the primary natural language of the first meaningful project requirement before clarification and technology selection, following section 10.1. Never require a language-selection step.

Understand and normalize the project requirement, identify constraints, and resolve material ambiguity. If the stack is not already constrained, research currently maintained options and present exactly three: recommended, conservative alternative, and a specific-strength alternative. Explain maintenance, ecosystem, fit, deployment, performance, hiring, and project constraints. Ask the user to choose once, then persist the choice.

If the technology is explicitly established, do not reopen selection.

## 6. Existing Project Bootstrap

Treat the repository as evidence. Do not recommend a replacement stack. Probe manifests, lockfiles, build/framework config, root structure, then a small sample of entry files. Stop once confidence is sufficient.

Before generating context, establish Project Language from a bounded sample of existing language conventions following section 10.1. Existing conventions take precedence over the current conversation language.

## 7. Stack Detection

Detect language, runtime, frameworks, package manager, build system, persistence, workspace structure, and infrastructure. Attach file evidence and confidence. Never infer architecture advice as a detection fact.

## 8. Stack Detection Fallback

Use a lightweight agent probe first. If confidence is insufficient, optionally run `npx -y @kuvibe/cli detect`. If it is unavailable or fails, perform a bounded manual scan and continue. Never ask the user to install KuVibe tooling.

## 9. Stack Profile Generation

Create `.agents/context/stack.md` with facts, language/runtime, frameworks, persistence, build/package management, testing, required engineering rules, project rules, conditional capabilities, and explicit exclusions. Base rules on repository evidence and current official guidance, not a permanent framework-specific KuVibe doctrine.

## 10. Project Context Generation

Create `.agents/project.md` containing the product, users, core domain, established stack, modules, repository shape, deployment, and important constraints. Keep only durable facts.

### 10.1 Project Language Detection and Policy

Project Language controls human-readable project artifacts, independently of programming language and the user's current conversation language. Establish it automatically during initialization:

1. **Greenfield:** use the primary natural language of the first meaningful user requirement. Ignore or give very low weight to identifiers, copied logs, and English technical terms. For example, `做一个基于 NestJS + PostgreSQL 的 SaaS CRM，需要 RBAC 和 audit log。` establishes Simplified Chinese (`zh-CN`).
2. **Existing project:** use this evidence order: explicit repository language conventions, predominant Markdown/docs language, recent Git commit descriptions, representative source comments, then current user input. Preserve established conventions even when the user speaks another language. Sample `README*`, `AGENTS.md`, docs entry pages and a few relevant docs; inspect only a few recent commits or representative comments if still needed. Exclude generated/vendor content and copied technical text. Preserve intentional localized documentation trees instead of counting translations as competing defaults. Stop as soon as evidence is sufficient; never read all docs, all source comments, or full Git history just for language detection. Unavailable Git or inconclusive repository evidence must not block initialization: continue down the evidence order and record any fallback.
3. **Persist once:** write a Project Language section in `.agents/project.md`, or keep the authoritative section in `.agents/context/conventions.md` with a pointer from project context. Record primary language (name and language tag), source/evidence, scope, and any established exceptions. Use ordinary Markdown, not fields in `.agents/kuvibe.yaml`. Do not duplicate competing policy definitions. For an existing harness missing this section, infer and merge it once using the same evidence order without re-bootstrap, replacing existing context, or changing schema.
4. **Apply:** use the established language for generated project-facing prose in `AGENTS.md`, project/context/workflow Markdown, business and architecture docs, engineering notes, agent plans (including `plan.md`), requirements, analyses, acceptance/review artifacts, test descriptions, code comments, Git commit subjects/bodies, PR/Issue descriptions, and persisted development summaries. Render generated template headings and explanatory prose in that language; template source language is not a project convention. Preserve existing files and localized docs. In existing source, preserve stable local comment conventions. Record finer-grained documentation/comment/commit or path exceptions only when supported by stable repository evidence or an explicit user instruction; otherwise use one primary language.
5. **Keep technical forms:** do not translate identifiers, class/function/variable names, API paths, JSON/config keys, database fields, package/framework names, CLI commands, protocol names, official technical terminology, standard quotations, or externally required terms. Preserve machine-readable metadata, managed markers, and canonical filenames. Keep Conventional Commit types/scopes and syntax (such as `feat:` and `fix:`); use Project Language for their descriptions. Engineering-note filenames retain `YYYYMMDD-HHmm-TYPE-SLUG.md` with ASCII/English type and slug, while titles and bodies use Project Language.
6. **Reuse:** future sessions read this context before creating artifacts. Do not redetect or change it for ordinary requirements, incidental language switches, English logs, or pasted API documentation. Change it only on an explicit user request to change project conventions; update the authoritative context and record a durable decision, applying only the requested scope. Do not bulk-translate existing docs or rewrite historical notes/commits implicitly.
7. **Communicate separately:** respond to the user in their current language. Project artifacts, including saved agent plans and summaries, follow Project Language and its recorded exceptions. A request for a one-off translation does not change the durable convention.

Example project-context section (write its human-readable labels in the detected language):

```markdown
## 项目语言

主要语言：简体中文（zh-CN）
来源：首次有效项目需求；中文句子中的 NestJS、RBAC 等术语不影响判断。
适用范围：项目文档、上下文、计划、工程笔记、测试说明、生成的注释、提交说明和 PR / Issue 描述。
例外：无。技术标识符、机器元数据和 ASCII 文件名保持原样。
```

## 11. Agent Adapter Generation

Create a concise `AGENTS.md` router that tells future agents what context and workflow to read. Other environment adapters must be thin pointers; never duplicate the protocol across many files.

## 12. Requirement Intake

For every non-trivial request, identify the intended outcome, affected users/modules, behavior, constraints, exclusions, and observable acceptance signals before editing.

## 13. Context Retrieval

Read project context, relevant module docs, relevant implemented notes, and only the source/tests needed for the request. Retrieve before clarifying.

Load the persisted Project Language and any referenced conventions before writing project artifacts; apply section 10.1 without redetecting an established language.

## 14. Requirement Completeness

Classify the requirement:

- `complete`: all material decisions are known; continue.
- `assumable`: only low-risk unknowns remain; record assumptions and continue.
- `incomplete`: a material decision is missing; pause for focused clarification.

## 15. Clarification Gate

Ask only when the answer changes business behavior/boundaries, state, permissions, data structure, API contracts, payment, security, significant UI, compatibility, irreversible operations, or acceptance. Ask 1–5 precise questions with concrete choices and a recommendation when possible; never ask for a generic “detailed description.”

## 16. Requirement Normalization

Normalize goals, actors, preconditions, happy path, edge/error behavior, non-goals, constraints, assumptions, and acceptance criteria. For complex work, save this in `.agents/notes/active/<slug>/requirement.md`.

## 17. Task Classification

Classify the work by intent (feature, bugfix, refactor, architecture, performance, security, migration, chore, or a justified extension), not by a user-selected command.

## 18. Scope Detection

Identify affected modules, interfaces, data, UI, operations, docs, and consumers. Prefer the narrowest coherent scope.

## 19. Risk Detection

Assess business, data-loss, security, compatibility, operational, performance, and rollback risk. Escalate workflow depth for high-impact or irreversible change.

## 20. Complexity Routing

- Level 0: tiny and explicit — analyze, implement, verify.
- Level 1: ordinary — analyze, plan, implement, verify, docs impact, optional note.
- Level 2: cross-module — multi-perspective analysis, acceptance, plan, implementation, review, docs, note.
- Level 3: payment, core permissions/security, major migration, breaking API, or architecture migration — research, architecture synthesis, human approval, then full delivery.

## 21. Capability Selection

Choose only relevant capabilities: requirement analysis, architecture, backend/API, frontend, UI, data, security, testing, acceptance, review, documentation, performance, or operations. The current agent may reason directly, use subagents, load native skills, or use tools. Capability need does not imply a particular mechanism.

## 22. Dynamic Engineering Workflow

Build the workflow from scope, risk, and complexity. Do not force every task through fixed PM/analyst/architect/UX roles. Preserve checkpoints that reduce the actual risk.

## 23. Artifact Collaboration

For Level 2–3 work, create reviewable artifacts such as `requirement.md`, `analysis.md`, capability-specific analysis, `acceptance.md`, and `plan.md` in `.agents/notes/active/<slug>/`. Agents implement from these artifacts. Only `active/` may contain subdirectories.

## 24. Implementation

Follow established context and conventions. Implement the smallest complete change, preserve compatibility unless explicitly changed, add tests with behavior, and avoid unrelated refactors.

## 25. Verification

Run focused tests first, then proportional static checks, integration/e2e checks, build, and acceptance verification. Report commands, outcomes, and anything not verified.

## 26. Review

Review correctness, regressions, security, compatibility, maintainability, tests, operations, and documentation. Resolve material findings before completion.

## 27. Living Documentation

Markdown under `docs/` is current truth and VitePress is only presentation. Organize around product/business modules and real architecture. Do not generate empty placeholder pages. Create UI docs only when pages, visual design, forms, interactions, states, or user flows exist.

## 28. Documentation Impact Gate

Before completion, explicitly evaluate impact on business rules, workflows, data model, API/CLI, UI, operations, and architecture. Update affected docs or record N/A.

## 29. Engineering Notes

Write meaningful history to `.agents/notes/implemented/YYYYMMDD-HHmm-TYPE-SLUG.md` using developer-local time and an ISO timestamp inside. Include problem, context, decision, alternatives, constraints, implementation, verification, docs, consequences, and follow-ups. Do not write notes for mere typos/formatting or trivial patches. Consolidate completed active artifacts into one note and remove their directory. Upgrade notes use type `migration` or `refresh`; never rewrite historical note bodies during an upgrade.

## 30. Completion Gate

Finish only when the requirement and blocking questions are resolved, implementation and proportional tests pass, acceptance is verified, review is complete, documentation impact is handled, and a note is written or explicitly N/A.

### 30.1 Automatic Version Impact at Requirement Completion

**The trigger is a completed requirement/change set, never a file save, filesystem event, individual Git commit, intermediate artifact, or repeated completion check.** A requirement may span many commits. Evaluate its aggregate impact once after implementation, acceptance, review, and documentation checks succeed. A version bump does not authorize a commit, tag, package publication, or hosted release.

1. Read the project's version convention and current authoritative version files; context snapshots never replace those files. During initialization, adoption, refresh, and maintenance, preserve supported release schemes and record source files, fixed/independent package policy, pre-1.0 policy, and supporting evidence in project/context Markdown. Do not impose KuVibe's own package versions on consumer projects. Apply these outcomes:

   - No product version exists: record `N/A` with inspected evidence; do not invent a manifest.
   - An explicit release policy, operative release automation, or explicit user instruction defers bumps: record `deferred`, a traceable policy/configuration reference or user decision, and the release stage or trigger responsible for the eventual increment. Missing release scripts, missing CHANGELOG, unchanged versions in prior commits, private-package status, or development-stage labels alone do not establish deferral.
   - An authoritative SemVer source and affected package scope are clear, and no supported exception applies: perform the aggregate bump under the rules below; absence of a release process is not an exception.
   - Version authority, package scope, or a non-SemVer/prerelease policy remains materially ambiguous: inspect relevant evidence, then ask a focused question only if unresolved. Keep the version gate pending; do not label ambiguity `none`, `N/A`, or `deferred` or invent a release scheme.

   A recorded convention is not proof of its own provenance. Verify the supporting evidence when relying on an exception; an earlier Agent's unsupported inference cannot justify it. Correct stale version facts and unsupported inferred policies narrowly, recording the evidence and reason without rewriting historical notes or overriding explicit user decisions. Never persist an unconfirmed inference as an established policy.

2. Classify semantic impact from external behavior, capabilities, compatibility, public contracts, and harness structure, never line count or commit count. `none`: no release-visible change (temporary files, caches, pure whitespace/formatting, unfinished work). `patch`: compatible bug/security/compatibility fixes, performance improvements, prompt or documentation corrections, and internal refactors preserving behavior. `minor`: new compatible capabilities, detectors, adapters, commands, optional templates/workflows, or configuration. `major`: incompatible public behavior/contracts, removed support, broken template consumers, changed entry conventions, or required incompatible migration. Highest impact wins across the completed change set: major > minor > patch > none.
3. Apply the project's pre-1.0 policy separately from semantic classification. KuVibe uses patch for compatible fixes and minor for compatible features or controlled breaking changes while major is zero. Retain the breaking-change description and migration requirements even when the effective bump is minor. Advancing to `1.0.0` requires an explicit protocol-stability decision; do not infer it from a routine protocol edit. At `1.0.0` and above, breaking changes require major. Other projects retain their established policy.
4. Assess Project Schema independently: increment its integer by one only for a harness structural contract change (required files, paths, responsibilities, or lifecycles), with an explicit consecutive migration and preservation checks. Compatible prompt/workflow refinements do not change schema. Increment each changed managed template's revision independently. A release increment alone never requires schema migration.
5. Before version writes, record the change-set identity, baseline, target, semantic/effective impact, schema decision, reasons, and affected version sources in the active plan or engineering note. Compute MAJOR.MINOR.PATCH with integer components: patch increments patch; minor increments minor and resets patch; major increments major and resets minor/patch; none preserves the version. For example, `0.4.9 + patch = 0.4.10`. Never use decimal arithmetic. Preserve an established prerelease process; do not silently strip prerelease/build metadata or invent a promotion.
6. Make completion retry-safe: consult the recorded decision and existing note/changelog before calculating. Reuse the same baseline and target if the same change set is already applied or partially applied; finish missing synchronization without another increment or duplicate changelog entry. If scope expands before completion, recompute the highest impact from the original baseline. If version sources changed concurrently or disagree with both baseline and target, reconcile ownership/evidence before writes; never overwrite another requirement's version. A separately accepted new requirement gets a new decision.
7. Synchronize the source of truth, relevant package versions/internal dependency references and lock metadata when required by the package manager, release metadata, changelog, and note. Record previous/next version, impact/reason, and schema outcome in the note when one exists; otherwise record the decision in the completion summary (and changelog for a bump). `none` needs a reason, not an artificial release entry. Always include semantic impact, execution outcome (`bumped`, `unchanged`, `deferred`, or `N/A`), previous -> next version per affected source, and the change/no-change reason in the user-facing completion summary, even when a note exists. For `deferred`, include its evidence and eventual release trigger; show unchanged actual versions rather than a hypothetical target as applied. For unversioned projects, show versions as N/A. Preserve existing changelog history and unrelated pending entries.
8. KuVibe itself uses root `package.json` as release authority and a fixed release shared by `packages/cli/package.json`. Synchronize current `kuVibe.md` release metadata/examples, `templates/kuvibe.yaml`, affected template revisions, current-version docs, and `CHANGELOG.md`. Validate candidate files first, then update this repository's `.agents/kuvibe.yaml` release/schema/applied revisions and `lastUpdatedAt`, preserving `initializedAt`, and run final consistency validation. Do not rewrite historical migration specifications, fixtures, or notes. In a consumer project, bump that product's versions only; installed KuVibe release/schema state changes only through KuVibe adoption/refresh/migration.
9. Failed acceptance or validation leaves the requirement incomplete: do not advance installed state, publish, or claim DONE. Retain baseline/target and completed/pending steps for repair and retry; never chain another bump from a partial target. Only after required synchronization and final checks pass, or a supported unchanged/deferred/N/A outcome is verified and reported, is the version gate complete. Ordinary automatic bump choices require no user selection of patch/minor/major.

## 31. Architecture Change Workflow

For changes to system boundaries, module ownership, public contracts, persistence strategy, deployment topology, or protocol fundamentals: document drivers and alternatives, obtain approval for Level 3 risk, update current architecture docs, implement/verify migration and rollback paths, and preserve rationale in an architecture note.

## 32. Maintenance and Refresh

Perform the version check before normal maintenance. Update context only when durable facts change. Correct stale context discovered during work. Do not re-bootstrap or overwrite project-specific knowledge. Periodically validate version state, managed boundaries, links, note naming, required context, tools output, and eval coverage.

## 33. Failure and Graceful Degradation

If optional tooling, package downloads, networking, subagents, skills, or documentation rendering fail, state the limitation and continue with safe local reasoning and available checks. Never make optional infrastructure a prerequisite for understanding or developing the project.

## Completion Checklist

```text
Requirement understood          ✓
Version state / upgrade         ✓ / N/A
Blocking questions resolved     ✓
Implementation                  ✓
Tests and acceptance            ✓
Review                          ✓
Documentation impact            ✓ / N/A
Engineering note                ✓ / N/A
Version impact analysis         ✓
Release version synchronized    ✓ / deferred (evidence + trigger) / N/A (reason)
Schema / template revisions     ✓ / N/A (reason)
CHANGELOG updated               ✓ / N/A (reason)
Version outcome reported        impact + outcome + previous -> next + reason
Final version consistency       ✓ / N/A (reason)
```
