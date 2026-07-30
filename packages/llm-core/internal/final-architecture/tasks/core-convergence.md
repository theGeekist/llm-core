---
architecture_version: 2
id: core-convergence
legacy_id: P0-150
title: Converge the core and delete old contracts
stage: core
status: done
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: coordinator
lease_started_at: 2026-07-30T01:30:00+08:00
lease_expires_at: 2026-08-01T01:30:00+08:00
base_sha: 6f57ac7
branch: task/P0-150-convergence
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-150-convergence
depends_on:
  - api-baseline
  - core-agent-runner
  - core-knowledge
  - core-conversations
  - core-media-schemas-skills
  - core-capability-bindings
  - core-ai-sdk-adapter
  - core-interactions
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - README.md
  - bun.lock
  - packages/llm-core/index.ts
  - packages/llm-core/package.json
  - packages/llm-core/README.md
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - docs/**
  - examples/**
  - apps/**
  - packages/llm-core/internal/final-architecture/tasks/core-convergence.md
review_owner: human
updated_at: 2026-07-30
---

# core-convergence — Converge the Core and Delete Old Contracts

## Objective

Integrate all core-stage spokes, update public fronts/call sites and remove the old
adapter-owned domain contracts and vocabulary in one controlled replacement.

## In scope

Shared barrels, imports/exports, workflow/recipe migrations, fixtures, examples,
docs, old directories/types and package smoke coverage.

## Out of scope

capabilities-stage context/artifact/evaluation and external framework
integrations.

## Acceptance criteria

- No old public names remain outside historical documents.
- No portable domain contract remains adapter-owned.
- Deep-import and dependency-direction checks pass.
- Every new subpath is covered by package smoke tests.
- Root and subpath exports match ADR-008 exactly.
- Published version and lockfile are `2.0.0`.
- Every runtime and declaration target resolves from an isolated packed
  consumer; emitted declarations contain no source-only aliases.
- Full repository verification passes.

## Verification

```sh
bun run lint
bun run build
bun run test:package
bun run typecheck
bun run typecheck:tests
bun run test
bun run typecheck:examples
bun run docs:snippets:typecheck
bun run docs:build
bun run --cwd packages/llm-core check:examples-deps
git diff --check
```

## Work log

- 2026-07-30T01:30:00+08:00 — Claimed by the Codex coordinator after all core
  dependencies completed. The clean `docs-v2` branch was explicitly frozen
  after rebasing at `7a24d4307e27ce192638b2f124da66e8a9d54477`; stale runtime
  and task-status prose was not merged into `main`.
- 2026-07-30 — Integrated the source, package-surface and documentation lanes
  in deterministic order. Reconciled the approved retrieval, WebSocket and
  Assistant UI fronts with the exact ADR-008 package surface, and corrected
  the example servers to resolve the installed `@types/bun` package.
- 2026-07-30 — Independent final review found and closed an abort-before-open
  WebSocket race. Finalization is now checked before and after re-entrant host
  callbacks, so cancelled transports cannot send credentials, send chat data
  or enqueue late incoming chunks.
- 2026-07-30 — Final verification passed at
  `06ee8f18b6a3016d84c6daade295b353ad422a86`: 424 repository tests; lint;
  package, example, snippet and test typechecks; schema freshness; build; docs
  build; both example client builds; dependency validation; `git diff --check`;
  and all 16 ESM-only runtime and declaration fronts from an isolated packed
  consumer.
- 2026-07-30 — Independently approved for package/public surface,
  safety/behavior and docs/examples. No review blocker remains.

## Handoff

- Architecture v2 publishes only the 16 ADR-008 subpaths at version `2.0.0`,
  requires Node.js 22 or newer and has no CommonJS or browser conditions.
- The root runtime export is limited to `createLocalAgentRunner`;
  runner-provenanced specifications come from `AgentRunner.prepare()`.
  Capability composition, controlled effects, workflow, interaction and
  qualified adapters live on their named public fronts.
- The legacy adapter-owned domain, recipes, pipeline authorities and generic
  diagnostics were removed after their supported behavior moved to v2 slices.
- Meaningful effects remain fail-closed behind durable receipts and trusted
  evidence. General workflows are passive-only; intervention resume owns
  durable effect recovery.
- Events and UI transport data cross closed, redacted boundaries. WebSocket
  cancellation is terminal even when host callbacks finalize re-entrantly.
- The core stage is complete. `capabilities-context-artifacts` and
  `capabilities-runtime-conformance` may be claimed in parallel;
  `capabilities-evaluation` remains
  dependent on capabilities-context-artifacts.
