---
architecture_version: 2
id: architecture-runtime-ownership-correction
title: Correct runtime ownership and mark v1 architecture
stage: architecture
status: done
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
conflicts_with: []
write_scope:
  - CHANGELOG.md
  - AGENTS.md
  - CLAUDE.md
  - README.md
  - examples/agentic/**
  - examples/kitchen-sink/**
  - packages/llm-core/docs/**
  - packages/llm-core/internal/README.md
  - packages/llm-core/internal/final-architecture/**
  - packages/llm-core/internal/v1-*.md
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
  - .github/workflows/docs.yml
  - .githooks/pre-commit
  - scripts/check-docs.ts
  - scripts/check-docs.test.ts
  - scripts/check-sloc.ts
  - scripts/check-sloc.test.ts
  - scripts/sloc-baseline.json
  - scripts/qualify-release.ts
  - tsconfig.json
required_reading:
  - path: packages/llm-core/docs/final-architecture/LANGUAGE.md
    reason: "Preserve the corrected distinction between portable intent and integration-owned execution."
  - path: packages/llm-core/docs/v1-implementation-plan.md
    reason: "Identify the retired runtime ownership assumptions that must remain historical only."
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - packages/llm-core/docs/final-architecture/LANGUAGE.md
  - packages/llm-core/docs/v1-implementation-plan.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
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
bun test scripts/check-docs.test.ts scripts/check-sloc.test.ts
bun run docs:check
bun run docs:build
bun run check:sloc
bun run typecheck:examples
bun run --cwd packages/llm-core format:check
sh -n .githooks/pre-commit
```

## Work log

Execution mode: shared-checkout

Execution rationale: The correction owns shared architecture, package and
documentation fronts in the canonical coordination checkout.

Concurrency evaluation: `architecture-product-foundation`; start alongside
because that task owns `packages/aifsd/**` and `bun.lock`, while this correction
does not edit either boundary. Delegated review uses read-only scopes.

Concurrent task scopes: `architecture-product-foundation` owns
`packages/aifsd/**` and `bun.lock`; this task leaves both untouched.

Swarm delegation: Codex/architecture-coordinator -> Codex/Franklin: package and
public-boundary review; Codex/architecture-coordinator -> Codex/Tesla: roadmap
governance review; Codex/architecture-coordinator -> Codex/James: semantic-waist
review; Codex/architecture-coordinator -> Codex/Erdos: governance review;
Codex/architecture-coordinator -> Codex/Kepler: migration review;
Codex/architecture-coordinator -> Codex/Planck: tooling review.

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
- 2026-08-04 — Moved package-owned architecture, task and v1 Markdown into
  `packages/llm-core/docs`, retained the shared VitePress site at root for
  future multi-package aggregation, made contributor routing package-aware,
  and corrected remaining public docs and examples that described the retired
  local runner or workflow proof as supported behavior.
- 2026-08-04 — Moved llm-core handoffs and the historical v1 changelog beside
  the package architecture, strengthened relative-link verification, removed
  lifecycle state from ROADMAP prose, and retired the duplicate llm-core AIFSD
  product tasks with a planned forward target at
  `aifsd/local-delivery-vertical-slice`, without claiming committed replacement
  authority.
- 2026-08-04 — Review fixes qualified cross-package governance references and
  made documentation and SLOC validation package-aware across repository gates.
- 2026-08-04 — Distinguished existing `replaced_by` authority from uncommitted
  `forward_to` handoffs and projected both separately in STATUS.
- 2026-08-04 — Final staged-snapshot validation passed the 55 adversarial
  documentation/SLOC tests, documentation and example checks, VitePress build,
  formatting, 383-module SLOC gate, 652-test release suite and isolated packed
  qualification of all 29 exports.

## Blocker

- None.

## Handoff

### Result

ADR-016 now governs the package: execution belongs to qualified integrations,
the local runner and workflow executor are test evidence, and package-owned
architecture lives under `packages/llm-core/docs` with v1 history clearly
marked.

### Decisions applied

- Applied ADR-016 without compatibility aliases or a default runtime.
- Kept the shared VitePress site at repository root while moving package
  authority and handoffs into the package.
- Preserved portable intent and extension contracts while removing supported
  runnable facades.

### Files changed

The correction changes repository routing (`AGENTS.md`, `CLAUDE.md`, root and
package READMEs), shared VitePress content and configuration, package examples,
package architecture and handoffs, v1 document names, package public/runtime
fronts and their tests, and the documentation/SLOC gates and fixtures. The
exact review manifest is `git diff --cached --name-status` from the task's
recorded base SHA.

### Verification evidence

Independent validation reconstructed the exact staged snapshot and passed the
652-test release build, all 29 isolated package exports, documentation links and
snippets, examples, formatting, VitePress build and SLOC gates.

### Deviations

None. `packages/aifsd/**` and `bun.lock` remained outside this task's changes.

### Remaining risks

The temporary test waivers are owned by
`architecture-test-sloc-decomposition`.

### Recommended next task

`architecture-test-sloc-decomposition` after this correction is committed.
