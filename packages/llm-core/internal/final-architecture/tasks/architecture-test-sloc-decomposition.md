---
architecture_version: 2
id: architecture-test-sloc-decomposition
title: Decompose legacy runner and workflow test modules
stage: architecture
status: proposed
priority: medium
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-runtime-ownership-correction
decision_dependencies:
  - ADR-007
  - ADR-016
conflicts_with: []
write_scope:
  - packages/llm-core/tests/application/agent/local-runner.test.ts
  - packages/llm-core/tests/application/agent/model-tool-program.test.ts
  - packages/llm-core/tests/application/workflow/resume.test.ts
  - packages/llm-core/tests/support/**
  - scripts/sloc-baseline.json
  - packages/llm-core/internal/final-architecture/tasks/architecture-test-sloc-decomposition.md
review_owner: coordinator
updated_at: 2026-08-04
---

# architecture-test-sloc-decomposition — Decompose legacy runner and workflow test modules

## Objective

Split the three sealed runner and workflow proof suites into focused modules
without weakening their conformance evidence.

## In scope

- Decompose the local-runner, model-tool-program and workflow-resume suites into
  capability-focused test modules below the 500-line source limit.
- Preserve all proof behavior and test-support ownership introduced by
  `architecture-runtime-ownership-correction`.
- Remove the temporary versioned SLOC waivers after decomposition.

## Out of scope

- Moving proof executors back into production source.
- Changing public package contracts or adding a default runtime.
- Changing the tested runner, pause/resume or workflow semantics.

## Acceptance criteria

- Every affected hand-written test module is at or below 500 physical lines.
- The three temporary SLOC waivers are removed.
- Runner and controlled-workflow proof counts and behavior remain intact.
- The package qualification suite passes.

## Verification

```sh
bun run check:sloc
bun run release:qualify:llm-core
```
