---
architecture_version: 2
id: architecture-source-layout-normalization
title: Normalize source filenames and directory depth
stage: architecture
status: proposed
priority: critical
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-decisions
decision_dependencies:
  - ADR-001
  - ADR-007
  - ADR-012
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/src/adapters/**
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
paths and inconsistent one-file adapter fronts; not claimed.

## Handoff

Pending.
