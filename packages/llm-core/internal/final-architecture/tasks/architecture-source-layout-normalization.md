---
architecture_version: 2
id: architecture-source-layout-normalization
title: Normalize source filenames and directory depth
stage: architecture
status: done
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: coordinator
lease_started_at:
lease_expires_at:
base_sha: 85dd8cdafb5c143c99cdd1f2c2ebbdd68e741043
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-decisions
decision_dependencies:
  - ADR-001
  - ADR-007
  - ADR-012
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/internal/final-architecture/STATUS.md
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/src/adapters/**
  - packages/llm-core/src/features/control/approval.ts
  - packages/llm-core/src/features/control/cancellation.ts
  - packages/llm-core/src/features/control/concurrency.ts
  - packages/llm-core/src/features/control/control-values.ts
  - packages/llm-core/src/features/control/policy.ts
  - packages/llm-core/src/features/control/runtime.ts
  - packages/llm-core/src/features/control/shared.ts
  - packages/llm-core/tests/**
  - docs/reference/package-exports.md
  - packages/llm-core/internal/final-architecture/tasks/architecture-source-layout-normalization.md
read_scope:
  - packages/llm-core/src/features/**
  - packages/llm-core/src/application/**
  - packages/llm-core/src/agent/**
  - packages/llm-core/src/control/**
  - packages/llm-core/src/conversation/**
  - packages/llm-core/src/interaction/**
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/workflow/**
review_owner: coordinator
updated_at: 2026-08-03
---

# architecture-source-layout-normalization — Normalize source filenames and directory depth

## Objective

Make the shallow owner/file convention the enforced path of correctness before
continuing work adds more source or test modules.

## In scope

- Flatten the classification-only `adapters/frameworks/**` and
  `adapters/providers/**` levels into one integration owner followed by
  descriptive prefixed files.
- Give AI SDK provider, media, retrieval, storage, UI and version-qualification
  code unambiguous names while preserving every public subpath and supported
  version claim.
- Remove unnecessary one-file internal leaf folders and rename vague adapter
  basenames such as `shared.ts`; retain a one-file directory only when it is a
  stable package/subpath front or a justified future owner.
- Preserve `public.ts` for internal architectural fronts and `index.ts` for
  package or published-subpath entrypoints.
- Mirror renamed owners in tests; fixture/generated directories remain valid
  extra depth.
- Add architecture checks for kebab-case source names, prohibited vague
  basenames, the front-file distinction and production paths deeper than
  `src/<layer>/<owner>/<file>` without a narrow allowlist.

## Out of scope

- Public export changes, adapter behavior changes, version upgrades, new
  abstractions or flattening feature/application ownership folders.

## Acceptance criteria

- LangChain, LlamaIndex and AI SDK adapters no longer require `frameworks`,
  `providers`, `model-support`, `media`, `retrieval` or `storage` classification
  layers; filenames retain that meaning through prefixes.
- `adapters/ai-sdk`, the AI SDK UI projection and `ai-sdk7` qualification are
  distinguishable by path and name without reading implementation bodies.
- No production TypeScript path exceeds the normal owner/file depth unless an
  architecture-test allowlist names its independently owned reason.
- New vague `common`, `misc`, `shared`, `utils` or generic `helpers` modules and
  non-kebab-case TypeScript filenames fail architecture tests.
- Internal fronts remain `public.ts`; `index.ts` appears only at package or
  published-subpath fronts. Runtime/declaration exports and consumer imports are
  unchanged.
- Renamed tests and fixtures retain the same behavioral and version evidence.
- New or materially changed hand-written source/test modules satisfy the
  500-SLOC rule or carry the approved waiver/follow-up evidence.

## Verification

```sh
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
git diff --check
```

## Work log

Added after the pre-commit source-layout audit found disciplined v2 feature and
application owners but classification-only adapter nesting, ambiguous AI SDK
paths and inconsistent one-file adapter fronts.

Execution mode: shared-checkout
Execution rationale: The canonical clean checkout is the default and the task owns the complete adapter and test normalization surface.
Concurrency evaluation: none; start alongside no other task because no task is active.
Concurrent task scopes: none
Swarm delegation: `layout_inventory` owned read-only movement/import reconnaissance; `architecture_checks` owned read-only enforcement reconnaissance; `oversized_test_decomposition` and `spec_test_decomposition` produced bounded test-split candidates; `final_diff_review` independently reviewed both completed correction passes.

Implementation: flattened the LangChain, LlamaIndex and AI SDK classification
trees into integration-owned, prefixed files; renamed internal adapter fronts to
`public.ts`; retained `index.ts` only for the five published adapter subpaths;
restored explicit LangChain and LlamaIndex integration fronts; and mirrored all
affected imports and test paths. The last vague production basename became
`features/control/control-values.ts`.

Enforcement: architecture tests now require kebab-case TypeScript filenames and
directory segments under both `src` and `tests`, understand `.test.ts` and
`.fixture.ts` suffixes, reject vague basenames without exceptions, require an
explicit front for every multi-file adapter owner, distinguish internal and
published fronts, enforce the normal `src/<layer>/<owner>/<file>` depth, and
scan the complete adapter tree for v2 package-boundary violations.

500-SLOC correction: the changed AI SDK model test was reduced to 500 lines
with a 31-line fixture module. The 1,139-line Spec Kit suite became four focused
test modules plus one fixture module; the 744-line PydanticAI suite became three
focused test modules plus one fixture module. Every resulting module is at or
below 500 physical lines, so no waiver or follow-up is required.

Verification: `bun test packages/llm-core/tests/architecture` passed 15 tests;
`bun run --cwd packages/llm-core release:build` passed schema verification,
lint, typecheck, 667 tests with 4 existing optional skips, declaration emit and
runtime emit; `bun run test:package` verified all 30 ESM-only exports from an
isolated packed consumer; `bun run docs:check` verified 45 pages, 26 snippets,
sidebar links and snippet types; `bun run --cwd packages/llm-core format:check`
and `git diff --check` passed.

## Handoff

Base SHA: `85dd8cdafb5c143c99cdd1f2c2ebbdd68e741043`.

Execution mode: shared canonical checkout on `main`; no concurrent task scopes.

Changed surface: adapter source paths and internal fronts, mirrored tests and
imports, architecture boundary enforcement, this task record and `STATUS.md`.
No package export, runtime behavior, supported-version or documentation-content
change was made.

Review notes: the independent diff review found a moved-test relative-import
error, unpublished `index.ts` fronts, a depth-check exception-mechanism gap and
the missing `STATUS.md` write scope. The next review found missing integration
fronts, incomplete test/directory naming enforcement and three changed legacy
tests over 500 lines. All findings were corrected without waivers. A final
independent pass verified the fronts, consumers, naming gate and decompositions;
its remaining vague-source exception finding was eliminated by renaming
`features/control/shared.ts` to `control-values.ts`. The four skipped tests are
existing optional external compatibility checks.

Shared-file requests: none. Coordinator review passed with no remaining
implementation findings; this task is complete and ready for its single
integration commit.

Review correction: reopened after review found missing LangChain/LlamaIndex
integration fronts, incomplete source/test path-name enforcement and absent
500-SLOC waiver or decomposition evidence for three changed legacy tests.

Correction result: decomposed rather than waived; final release, package,
documentation, formatting and diff verification all pass.

Final scope correction: the atomic `shared.ts` to `control-values.ts` rename
also updated its five direct importers. Their exact paths were added to
`write_scope` after confirming that no active or conflicting task owns them;
the scope was not broadened to the whole control feature.
