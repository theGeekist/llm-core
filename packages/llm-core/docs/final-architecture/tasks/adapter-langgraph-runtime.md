---
id: adapter-langgraph-runtime
title: Qualify the LangGraph runtime integration
stage: adapters
status: done
priority: high
depends_on:
  - architecture-external-contract-fidelity
  - architecture-runtime-ownership-correction
  - runtime-operation-contract-correction
  - architecture-release-reproducibility
  - capabilities-runtime-conformance
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-016
  - ADR-017
conflicts_with:
  - adapter-catalogue-public-qualification
  - adapter-pydantic-ai-runtime
  - adapter-strands-runtime
write_scope:
  - bun.lock
  - packages/llm-core/src/adapters/langgraph-runtime/**
  - packages/llm-core/tests/adapters/langgraph-runtime/**
  - apps/langgraph-runtime-qualification/**
  - docs/adapters/langgraph-runtime.md
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-langgraph-runtime.md
required_reading:
  - path: context/aifsd-research/profiles/langgraph.md
    reason: "Use the researched graph, reducer, interrupt and checkpoint semantics as contextual evidence."
  - path: docs/adapters/runtime-conformance.md
    reason: "Preserve exact portable conformance without flattening native graph state."
read_scope:
  - context/aifsd-research/profiles/langgraph.md
  - docs/adapters/runtime-conformance.md
review_owner: coordinator
updated_at: 2026-09-06
---

# adapter-langgraph-runtime — Qualify the LangGraph runtime integration

## Objective

Implement and qualify an exact-version LangGraph TypeScript adapter as an
`AgentRunner` without flattening native graph, reducer, interrupt, checkpoint or
thread semantics.

## In scope

- Pin one LangGraph TypeScript version in an isolated qualification app.
- Implement the `AgentRunner` projection and explicit capability metadata.
- Exercise graph state, reducers, interrupts, checkpoints, threads,
  cancellation and evidence through bounded fixtures.

## Out of scope

- Reimplementing LangGraph orchestration in the kernel.
- Treating native checkpoints or state as portable contracts.
- Supporting versions not covered by exact qualification evidence.

## Acceptance criteria

- The adapter passes the declared runner conformance level in an isolated
  exact-version fixture.
- Native state remains opaque and compatibility metadata is explicit.
- Every supported portable operation has deterministic events, controls and
  evidence; unsupported native operations remain explicit.
- No local-runner fallback exists.

## Verification

```sh
bun test apps/langgraph-runtime-qualification packages/llm-core/tests/adapters/langgraph-runtime
bun run --cwd packages/llm-core release:build
bun run docs:check
bun run check:sloc
```

## Work log

Execution mode: shared-checkout
Execution rationale: The adapter owns isolated source, test, qualification-app
and public-document paths in the canonical checkout.
Concurrency evaluation: Four native-agent adapter slices are present in the
shared checkout. Their source, test and document scopes are disjoint; this task
alone owns `bun.lock` and the LangGraph paths.
Concurrent task scopes: Antigravity CLI hooks, Antigravity Desktop sidecar,
Claude native session and Codex Desktop hooks.

2026-09-05: Reserved through TaskGraph from canonical `main` at `09761df`. Read
the ordered research profile, runtime conformance authority, dependency task
records and ADR-006, ADR-007, ADR-016 and ADR-017 before implementation.

2026-09-05: Implemented an injected compiled-graph runner against exact
`@langchain/langgraph` `1.0.7`. The portable surface supports preparation,
start, observation and cooperative cancellation for read-only agents. Native
checkpoints, threads, reducers and interrupt/resume remain LangGraph-owned;
portable checkpoint resume and intervention fail explicitly. No local-runner
fallback exists.

2026-09-05: Added an isolated exact-version workspace fixture using real
`StateGraph`, `MemorySaver`, parallel reducer updates, independent threads,
interrupt plus `Command` resume and active-node `AbortSignal` delivery. Focused
adapter and exact-runtime suites pass with 9 tests and 35 assertions. Package
typecheck, frozen-lockfile install and scoped formatting pass. The repository
SLOC command currently traverses a separate Claude worktree and reports its
pre-existing over-limit files; every new task-owned module is below 500 lines.

2026-09-05: Independent review found six contract defects behind the original
green happy-path suite. Replaced the ad hoc disposition map with closed
portable/native operation declarations and exact fixture references. Events
now stream from a live log, with started visible before settlement and distinct
cancellation requested and acknowledged evidence. Successful graphs no longer
depend on checkpoint inspection; one immutable state snapshot is shared when
available, while invocation, abort and unavailable-state errors remain distinct
native observations. Preparation, start and cancellation now reject hostile or
malformed closed-boundary inputs before graph effects. Focused correction tests
also prove no-checkpointer completion and distinguish ignored-abort failures.

2026-09-05: Re-review narrowed five remaining fidelity gaps. The operation
matrix now labels state and error summaries as llm-core-owned projections and
marks raw LangGraph state, errors and event streaming unsupported. Every
unsupported entry has an executable negative fixture. Cancellation requires
both an adapter-requested abort and the exact native `AbortError`; terminal
clock failure closes with one failed result and event; observations always use
the canonical frozen source contract.

2026-09-05: The aggregate release gate then found one architecture-boundary
violation in the live event log import. Replaced that private application-layer
dependency with an adapter-owned 34-line log, reran the affected source-boundary
suite, and returned the final diff to the same reviewer. Final re-review reports
no actionable findings.

2026-09-05: Repeated the full release build after the architecture correction:
900 passed, 4 optional cases skipped, 0 failed, with declaration and runtime
emission successful. Released the repository-local TaskGraph reservation while
leaving the task in review for user-controlled integration.

2026-09-06: The user authorised integration of the complete reviewed adapter
tranche. Reconciled this task's shared `STATUS.md` scope with the legacy-removal
task as one coordinator-owned lifecycle projection and closed the task with its
final clean review and release evidence intact.

## Handoff

### Result

Qualified internal LangGraph `AgentRunner` candidate with an exact
`@langchain/langgraph` `1.0.7` qualification app. Publication remains outside
this task.

### Decisions applied

- Injected the compiled graph, identity and exact source contract at application
  composition.
- Used the portable run ID as LangGraph `thread_id` without treating the native
  thread as a portable provider session.
- Kept checkpoint identity, pending nodes and interrupt count in a separate
  native observation.
- Projected a native interrupted graph to the closed portable failure reason
  `langgraph-interrupted`; native resume remains a direct LangGraph operation.
- Limited preparation to read-only agents and reported controlled effects as
  unsupported.
- Published live started, cancellation-control and terminal events with
  monotonic sequence numbers.
- Passed an `AbortSignal` to graph invocation, reported cancellation as
  cooperative and required the exact native `AbortError` before classifying a
  rejected invocation as cancelled.
- Decoupled optional checkpoint state inspection from successful graph
  execution and captured at most one terminal snapshot.
- Declared every portable and native operation through the closed ADR-017
  disposition vocabulary with contracts and fixture references.
- Kept adapter-owned state and error summaries distinct from unsupported raw
  LangGraph state, exception and event-stream surfaces.
- Rejected accessor-backed, malformed and non-portable definition, start and
  cancellation input before native side effects.
- Rejected version drift and omitted any local-runner fallback.

### Files changed

- `bun.lock`
- `packages/llm-core/src/adapters/langgraph-runtime/{event-log,profile,protocol,public,runner,validation}.ts`
- `packages/llm-core/tests/adapters/langgraph-runtime/runner.test.ts`
- `apps/langgraph-runtime-qualification/package.json`
- `apps/langgraph-runtime-qualification/qualification.test.ts`
- `docs/adapters/langgraph-runtime.md`
- This task record and the generated architecture status.

### Verification evidence

- `bun test apps/langgraph-runtime-qualification packages/llm-core/tests/adapters/langgraph-runtime`: 15 passed, 0 failed, 61 assertions.
- `bun run --cwd packages/llm-core typecheck`: passed.
- `bun run --cwd packages/llm-core typecheck:tests`: passed.
- `bun run --cwd packages/llm-core release:build`: 900 passed, 4 optional
  cases skipped, 0 failed, 4,036 assertions; declaration and runtime builds
  passed.
- `bun run docs:check`: verified 49 published pages, 169 package engineering
  pages, 6 routing pages, 23 embedded snippets and all sidebar links.
- `bun install --frozen-lockfile`: passed against 1,473 installs with no changes.
- Scoped ESLint over every task-owned TypeScript file: passed with zero errors
  and zero warnings.
- Scoped Prettier check over every task-owned source, test and app path: passed.
- Task-owned files are all below the 500-line SLOC target. The aggregate SLOC
  command is blocked by pre-existing files under
  `.claude/worktrees/adapter-claude-native-session`.
- Final independent review of the current task-owned diff: no actionable
  findings. The reviewer repeated the 20-test source-boundary plus LangGraph
  suite, both typechecks, zero-warning scoped ESLint, Prettier and diff checks.
