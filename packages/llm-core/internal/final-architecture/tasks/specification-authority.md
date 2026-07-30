---
architecture_version: 2
id: specification-authority
title: Recheck specification decision before execution
stage: specifications
status: proposed
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - specification-compiler
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-009
  - ADR-011
  - ADR-012
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/workflow/**
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/tests/application/workflow/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/tests/specification-compiler/**
  - packages/llm-core/internal/final-architecture/tasks/specification-authority.md
read_scope:
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/state/**
review_owner: coordinator
updated_at: 2026-07-31
---

# specification-authority — Recheck specification decision before execution

## Objective

Make execution-authority drift fail closed on every existing
`llm-core`-controlled preparation, execution and resume path before runtime
construction or effects begin.

## Deliverables

- Agent and workflow gateways accept a `ProjectionEnvelope<TProjection>` rather
  than treating a raw native projection as execution authority.
- Each gateway calls specification-compiler's `verifyProjectionAuthoritySnapshot` against
  trusted clock, authority, policy and source-revision ports.
- Preparation validates immediately before constructing a native runtime
  object. Execution and resume validate again immediately before effects.
- Projection identity and authority-snapshot bindings survive the durable state
  needed for resume.
- Projection-derived execution context cannot be stripped or substituted before
  controlled tool execution.

## Acceptance criteria

- The call-site audit identifies every existing agent/workflow gateway capable
  of consuming a projected plan and records its enforcement point.
- This regression rejects before adapter preparation, tool invocation or any
  other effect:

  ```text
  project successfully
  → expiry, policy, source revision or authority changes
  → prepare, execute or resume
  → reject before any effect
  ```

- Successful preparation does not authorize later execution indefinitely;
  execution and resume revalidate current authority independently.
- A raw target-neutral or native projection extracted from its envelope cannot
  enter an `llm-core`-controlled preparation or execution path.
- Durable reload does not restore runtime authority without current
  verification.
- Unrelated direct agent/workflow inputs retain their existing contract; the
  projection authority requirement applies when execution derives from a
  specification projection.

## Verification

```sh
bun test packages/llm-core/tests/specification-compiler
bun test packages/llm-core/tests/application/agent
bun test packages/llm-core/tests/application/workflow
bun test packages/llm-core/tests/application/tool-execution
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Not started.

## Handoff

Pending.
