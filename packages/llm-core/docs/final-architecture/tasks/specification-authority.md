---
id: specification-authority
title: Recheck specification decision before execution
stage: specifications
status: done
priority: high
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
  - packages/llm-core/src/application/specification-compiler/runtime.ts
  - packages/llm-core/src/agent/facade.ts
  - packages/llm-core/src/agent/index.ts
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/tests/application/workflow/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/tests/specification-compiler/**
  - packages/llm-core/docs/final-architecture/tasks/specification-authority.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Preserve use-time authority, source revision and expiry revalidation."
  - path: docs/reference/failures.md
    reason: "Preserve public failure distinctions for stale and unauthorized specification use."
read_scope:
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - docs/reference/failures.md
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/state/**
review_owner: coordinator
updated_at: 2026-08-01
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
- 2026-08-01 — Implemented and reviewed directly on `main` at `a68502f`, per
  user direction. No overlapping specification task had an active write scope,
  so the normal isolated-worktree setup was intentionally not used.
- 2026-08-01 — Reopened after review identified missing Agent-plan validation
  and a transient-only workflow authority binding.
- 2026-08-01 — Remediated at `a1b4191`; awaiting user review before task
  completion or dependent-task allocation.
- 2026-08-01 — User review passed. Marked done after the verified remediation
  integrated on `main` at `a1b4191`.

## Handoff

Review passed for `a1b4191` (`fix(specifications): persist execution
authority`), following the original implementation at `a68502f`.

- Enforcement points: Agent creation/preparation/start/run and child/resume
  boundaries; controlled tool validation, pre-start, and final pre-invocation
  boundaries; workflow resume admission, durable claim, and durable
  effect-start boundaries.
- Compiled targets are now portable cloned/frozen snapshots. Agent, tool, and
  workflow targets are explicitly bound to the actual definition, action, or
  declarative step plan before execution.
- A registered compilation without a full exact Agent definition now fails
  closed. Specification-derived checkpoints persist a closed accepted-decision
  binding and require a new registered, current, matching compiled workflow
  target at resume; omission of that target now rejects.
- Changed files: `src/agent/facade.ts`, `src/agent/index.ts`,
  `src/application/agent/{local-runner,public,types}.ts`,
  `src/application/specification-compiler/runtime.ts`,
  `src/application/tool-execution/{execute,public,types}.ts`,
  `src/application/workflow/{authority,execution,resume,runtime-public,types}.ts`,
  `tests/application/tool-execution/execute.test.ts`,
  `tests/application/workflow/resume.test.ts`, and
  `tests/specification-compiler/authority.test.ts`.
- Verification (all exit 0): 109 focused task tests; package and test
  typechecks; contract-schema freshness; lint; Prettier check; `git diff
--check`.
- ADRs applied: ADR-005, ADR-006, ADR-009, ADR-011, ADR-012. No deviation from
  their authority or portable-data constraints; direct-main execution was the
  coordination-process deviation noted above.
- Remaining risks: revocation remains a trusted authority-port concern outside
  the final synchronous pre-invocation check. No shared-file follow-up is
  requested.
