---
architecture_version: 2
id: specification-authority
title: Recheck specification decision before execution
stage: specifications
status: ready
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

- Agent and workflow gateways accept a `CompiledSpecification<T>` rather than
  treating a raw native value as execution authority.
- Each gateway calls specification-compiler's internal
  `verifyCompilationAuthority` against
  trusted clock, authority, policy and source-revision ports.
- Preparation validates immediately before constructing a native runtime
  object. Execution and resume validate again immediately before effects.
- Compilation identity and authority-snapshot bindings survive the durable state
  needed for resume.
- Compilation-derived execution context cannot be stripped or substituted before
  controlled tool execution.
- `AgentConfig.specification` accepts
  `CompiledSpecification<ExecutionPlan>`. `createAgent`, `Agent.run` and
  `Agent.start` are the exact common preparation/execution gateways; no
  separate common `runAgent` function is introduced.

## Acceptance criteria

- The call-site audit identifies every existing agent/workflow gateway capable
  of consuming a compiled plan and records its enforcement point.
- This regression rejects before adapter preparation, tool invocation or any
  other effect:

  ```text
  compile successfully
  → expiry, policy, source revision or authority changes
  → prepare, execute or resume
  → reject before any effect
  ```

- Successful preparation does not authorize later execution indefinitely;
  execution and resume revalidate current authority independently.
- A raw target-neutral or native value extracted from
  `CompiledSpecification<T>` cannot
  enter an `llm-core`-controlled preparation or execution path.
- Durable reload does not restore runtime authority without current
  verification.
- Unrelated direct agent/workflow inputs retain their existing contract; the
  compilation-authority requirement applies when execution derives from a
  compiled specification.

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

- 2026-08-01 — Promoted to ready after `specification-compiler` completed at
  `7c68f6f`. No recorded authority-enforcement blocker remains.

## Handoff

Pending.
