---
id: cost-budget-enforcement
title: Integrate budget decisions at execution gateways
stage: qualification
status: proposed
priority: high
depends_on:
  - architecture-source-layout-normalization
  - cost-budget-control
  - runtime-tools-front-boundary
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-013
  - ADR-014
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/workflow/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/tests/application/workflow/**
  - docs/capabilities/evidence.md
  - packages/llm-core/docs/final-architecture/tasks/cost-budget-enforcement.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/tasks/capabilities-cost-intelligence.md
    reason: "Retain the cancelled source task as provenance for gateway enforcement."
  - path: docs/orchestration/controlled-tool-execution.md
    reason: "Preserve effect ordering and observed facts at execution gateways."
read_scope:
  - packages/llm-core/docs/final-architecture/tasks/capabilities-cost-intelligence.md
  - docs/orchestration/controlled-tool-execution.md
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/model/**
review_owner: coordinator
updated_at: 2026-08-08
---

# cost-budget-enforcement — Integrate budget decisions at execution gateways

## Objective

Require current budget decisions at the controlled model, tool and workflow
dispatch boundaries so the portable decision model cannot remain an optional,
unused helper.

## In scope

- Pre-dispatch verification before model or tool effects begin.
- Bounded mid-run checkpoints at existing safe orchestration boundaries and
  terminal overrun evidence.
- Explicit propagation of allow, warn, reroute, stop and overrun outcomes
  without rewriting observed usage, receipts or completed effects.
- Small gateway collaborators that preserve the existing public operations and
  `MaybePromise` behavior.

## Out of scope

- Price calculation, model selection, a hosted quota service, new root exports
  or claiming that cancellation intent reversed an effect.

## Acceptance criteria

- A pre-dispatch stop or unavailable-required-budget decision rejects before
  any model or tool effect and produces evidence.
- A mid-run stop records cancellation intent and preserves usage and effects
  already observed.
- A reroute outcome returns control without selecting or dispatching a target;
  separate routing evidence and policy authorization are required.
- Agent, tool and workflow entry paths cannot bypass the same budget authority
  by calling a lower-level executor directly.
- Fully synchronous paths remain synchronous.
- Every new or materially changed hand-written source/test module targets
  roughly 500 lines. A module from 501 through 600 lines records the lightweight
  `approximately 500 lines` waiver; only work above 600 requires decomposition
  or the stronger coordinator waiver and follow-up.

## Regression

```text
budget denies or stops before dispatch
-> prepare or execute is attempted
-> reject before any effect
```

## Verification

```sh
bun test packages/llm-core/tests/application/tool-execution packages/llm-core/tests/application/agent packages/llm-core/tests/application/workflow
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Added after deep programme review found that the decision contract alone could
pass without controlling an execution gateway; not claimed.

## Handoff

Pending.
