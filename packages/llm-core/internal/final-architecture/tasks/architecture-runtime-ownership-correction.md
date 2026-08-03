---
architecture_version: 2
id: architecture-runtime-ownership-correction
title: Correct runtime ownership and mark v1 architecture
stage: architecture
status: review
priority: critical
preferred_owner_kind: coordinator
owner: architecture-coordinator
owner_kind: coordinator
lease_started_at: 2026-08-04T00:00:00+08:00
lease_expires_at: 2026-08-05T00:00:00+08:00
base_sha: 059f3e5c387eee5991d433b4e6c1e2feae18a691
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-decisions
decision_dependencies:
  - ADR-016
conflicts_with:
  - language-rollout
  - applications-client-characterization
  - applications-client-contract
  - applications-client-platform-qualification
  - applications-client-subpath-release
  - applications-desktop
  - applications-mobile
write_scope:
  - packages/llm-core/internal/**
  - packages/llm-core/README.md
  - packages/llm-core/src/agent/**
  - packages/llm-core/src/workflow/**
  - packages/llm-core/src/conversation/**
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/features/workflow/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/application/workflow/**
  - packages/llm-core/index.ts
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tests/**
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - docs/**
  - scripts/check-sloc.ts
  - scripts/sloc-baseline.json
  - scripts/qualify-release.ts
  - tsconfig.json
review_owner: human
updated_at: 2026-08-04
---

# architecture-runtime-ownership-correction — Correct runtime ownership and mark v1 architecture

## Objective

Restore the AIFSD boundary in which `llm-core` owns portable contracts,
conformance and evidence while qualified integrations own execution.

## In scope

- Accept ADR-016 and reconcile affected v2 authority documents.
- Prefix every pre-v2 architecture document with `v1-` and add an authority
  notice for the historical corpus.
- Remove supported public fronts that implicitly execute the local runner or
  workflow engine.
- Retain the local runner only as internal conformance evidence.
- Replace the client-first roadmap with delivery-slice and runtime-adapter
  priorities.
- Update public documentation, fixtures, qualification lists and architecture
  tests to the corrected package surface.

## Out of scope

- Implementing a LangGraph, PydanticAI or other new runtime adapter.
- Building the AIFSD SDK/CLI or delivery application.
- Compatibility aliases or deprecation bridges for the removed v2 facades.

## Acceptance criteria

- No supported common API silently selects `createLocalAgentRunner`.
- No supported common Workflow API executes a kernel-owned workflow engine.
- The TypeScript runner and controlled workflow proof live under test support,
  with no proof executor retained under production `src/application`.
- Runner implementations are described and planned as adapter-owned.
- The typed semantic waist represents application, agent, tool, context,
  workflow intent, evaluation, approval and capability intent.
- Compiled targets are portable data or serialized integration references, never
  live native framework objects.
- Pre-v2 documents are unmistakably historical by filename and index notice.
- Package exports, tests and documentation agree with ADR-016.

## Verification

```sh
bun run --cwd packages/llm-core release:build
bun run release:qualify:llm-core
```

## Work log

- 2026-08-04 — Human requested correction after a complete review of the early
  architecture corpus identified local-runtime, specification-target and
  product-roadmap drift.
- 2026-08-04 — Accepted ADR-016, renamed all 27 pre-v2 documents with `v1-`,
  removed the runnable Agent/Workflow/Conversation facades and public local
  runner/workflow runtime, corrected documentation and roadmap priorities, and
  added real runtime plus AIFSD delivery task briefs.
- 2026-08-04 — `release:build` passed 652 tests with four optional skips;
  documentation and snippets passed; the isolated packed consumer verified all
  29 corrected ESM runtime and declaration entrypoints.
- 2026-08-04 — Deep review reconciled the task lease with the complete
  correction patch, made Strands explicitly depend on ADR-016, and removed the
  false runtime-substitution prerequisite from the independent AIFSD delivery
  product stream.
- 2026-08-04 — Relocated the TypeScript runner and controlled workflow executor
  into explicit test-support fronts, extracted portable workflow intent into a
  feature front, implemented the typed semantic waist, constrained compilation
  to portable targets or serialized integration references, marked retired
  language fixtures as v1 evidence, and passed the full release qualification
  including all 29 isolated package exports.

## Blocker

- None.
