---
architecture_version: 2
id: runtime-tools-front-boundary
title: Remove the tooling feature-to-application boundary exception
stage: qualification
status: done
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: coordinator
lease_started_at: 2026-08-09T01:01:01+08:00
lease_expires_at: 2026-08-11T01:01:01+08:00
base_sha: 8da1b87ae7a3091d6092e02e8356d1aa44eb184c
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-source-layout-normalization
  - runtime-tool-execution-decomposition
decision_dependencies:
  - ADR-001
  - ADR-005
  - ADR-008
  - ADR-012
  - ADR-015
conflicts_with:
  - architecture-release-reproducibility
  - architecture-status-validation
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - applications-client-subpath-release
  - architecture-legacy-functional-removal
write_scope:
  - packages/llm-core/src/features/tooling/runtime.ts
  - packages/llm-core/src/tools/**
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - tsconfig.json
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/tests/application/tool-execution/**
  - docs/reference/package-exports.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-tools-front-boundary.md
required_reading:
  - path: docs/reference/package-exports.md
    reason: "Preserve the exact tools runtime export while removing only the internal dependency exception."
read_scope:
  - docs/reference/package-exports.md
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/src/features/tooling/**
review_owner: coordinator
updated_at: 2026-08-09
---

# runtime-tools-front-boundary — Remove the tooling feature-to-application boundary exception

## Objective

Make the tools runtime package front the aggregation owner so the tooling
feature no longer imports upward into application orchestration.

## In scope

- Move public aggregation to the package-level tools runtime front.
- Remove the architecture-test exception permitting
  `features/tooling/runtime.ts -> application/tool-execution/public.ts`.
- Preserve the existing `@geekist/llm-core/tools/runtime` API exactly.

## Out of scope

- New exports, controlled-execution behavior changes or feature rearrangement.

## Acceptance criteria

- Feature dependency checks pass with no tooling-to-application exception.
- Runtime and declaration consumers observe no API change.
- The complete release and isolated packed-consumer gates pass.

## Verification

```sh
bun test packages/llm-core/tests/architecture packages/llm-core/tests/application/tool-execution
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned by ADR-015; not claimed.

Execution mode: shared-checkout
Execution rationale: The canonical checkout is clean and the task is a narrow package-front ownership correction.
Concurrency evaluation: none; start alongside no other active task because the planner reports no active work.
Concurrent task scopes: none
Swarm delegation: none

2026-08-09: Claimed by `codex-root` from
`8da1b87ae7a3091d6092e02e8356d1aa44eb184c`. The package-level tools runtime
front will aggregate the tooling feature and controlled-execution application
front without changing the published subpath or export set.

2026-08-09: Coordinator scope correction added the controlled-execution tests
already named by the verification command. They import the published aggregate
through its former feature-owned source path and must move to the new
package-owned front in the same atomic boundary correction.

2026-08-09: The documentation snippet typecheck exposed the repository root
TypeScript mapping as another consumer of the moved subpath front. With no
concurrent task active, the coordinator added that exact shared file and
repointed only `@geekist/llm-core/tools/runtime`.

2026-08-09: Implementation completed. `src/tools/runtime.ts` now owns the
published aggregate of the tooling runtime contracts and controlled-execution
application front. `features/tooling/runtime.ts` exports only feature-owned
runtime contracts, the architecture exception was deleted, and package,
build, TypeScript, test and documentation consumers now resolve the package
front. The published `./tools/runtime` name and export set are unchanged.

2026-08-09: Verification passed. Focused architecture and controlled-execution
tests passed 44/44. The package release build passed 649 tests with four
existing optional compatibility skips and no failures. The isolated packed
consumer verified all 29 ESM runtime and declaration exports. Documentation
checks and snippet typechecking, package formatting, `git diff --check`, and
the task planner passed. The first packed-consumer attempt stalled in its
restricted temporary dependency install; the exact gate passed when rerun with
network permission.

2026-08-09: The user approved the implementation and requested the status
transition, commit, push and CI monitoring. The coordinator transitioned the
task to `done` before staging the complete governance and implementation set.

2026-08-08: Raised to critical because the exact A2A and stateless MCP consumer
surfaces now depend directly on this ownership correction. Leaving the
prerequisite below the protocol task's priority would cause the planner's
intentional priority short-circuit to postpone the dependency that unblocks
Simple Chat.

## Handoff

Approved task-scoped implementation at base
`8da1b87ae7a3091d6092e02e8356d1aa44eb184c`, ready for commit and push.

- Execution mode: shared canonical checkout on `main`.
- Concurrent scopes: none.
- Changed implementation: package-owned tools runtime front, feature runtime
  front, export map, build entrypoint and TypeScript mappings.
- Changed evidence: architecture checks and controlled-execution consumers now
  exercise the package-owned aggregate; package-export documentation records
  its ownership.
- Delegation: none.
- Deviations: two narrow coordinator scope corrections added the already named
  controlled-execution tests and the root TypeScript mapping discovered by the
  documentation gate.
- Remaining risk: none identified. The package subpath and exact exports are
  preserved by the packed runtime and declaration consumer.
