---
id: runtime-operation-contract-correction
title: Replace projected runtime support with exact operations
stage: adapters
status: done
priority: critical
depends_on:
  - architecture-external-contract-fidelity
  - capabilities-runtime-conformance
decision_dependencies:
  - ADR-017
conflicts_with: []
write_scope:
  - scripts/check-sloc.ts
  - scripts/check-sloc.test.ts
  - scripts/check-sloc-mounts.test.ts
  - scripts/sloc-baseline.json
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/runtimes/**
  - packages/llm-core/tests/agent/**
  - packages/llm-core/tests/support/local-agent/**
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/tests/application/interaction/**
  - packages/llm-core/tests/specification-compiler/**
  - packages/llm-core/tests/conformance/**
  - docs/adapters/runtime-conformance.md
  - docs/guide/agent.md
  - docs/guide/workflow.md
  - docs/orchestration/workflows.md
  - docs/reference/conformance.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-operation-contract-correction.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Apply the runtime operation inventory and replace projected support with exact operations."
  - path: docs/adapters/runtime-conformance.md
    reason: "Reconcile the existing conformance evidence with the corrected operation matrix."
read_scope:
  - scripts/sloc-baseline.json
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/tests/support/local-agent/**
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/tests/application/interaction/**
  - packages/llm-core/tests/specification-compiler/**
review_owner: human
updated_at: 2026-08-07
---

# runtime-operation-contract-correction — Replace projected runtime support with exact operations

## Objective

Replace projected runtime compatibility claims with exact operation support and
native runtime ownership.

## In scope

- Remove `projected` from `RuntimeSemanticDisposition`.
- Split normalized portable operations from native runtime operations instead
  of treating normalization as support for the native contract.
- Correct the existing PydanticAI compatibility declaration and conformance
  fixtures.
- Define the kernel-owned closed portable output contract and keep qualified
  PydanticAI native observations on a separate integration-owned operation.
- Establish the exact operation-matrix form inherited by later LangGraph,
  PydanticAI, Strands and Temporal integration tasks, using the closed
  `supported`, `unsupported` and `not-applicable` dispositions.
- Replace runtime and workflow adoption guidance that currently recommends
  projected, degraded or semantic-loss support declarations.

## Out of scope

- Making checkpoints or sessions interchangeable between runtimes.
- Moving native runtime state into kernel contracts.
- Implementing the future published runtime adapters.

## Acceptance criteria

- Every supported operation has one exact semantic contract and executable
  fixture set.
- `AgentResult.output` is a closed kernel-owned text or JSON contract, usable
  through `AgentRunner` without integration-specific knowledge.
- Native events, sessions, checkpoints and provider state retain native
  identity and ownership.
- Unsupported native operations are not represented as projected support.
- `not-applicable` is used only with exact-version source evidence that the
  runtime contract does not define the operation or semantic dimension.
- Later runtime tasks inherit the corrected matrix and contain no loss-based
  support criteria.
- Runtime, agent, workflow and conformance pages describe exact portable and
  native operations without presenting conversion loss as supported behaviour.

## Verification

```sh
bun test packages/llm-core/tests/conformance
bun run --cwd packages/llm-core typecheck
bun run --cwd packages/llm-core release:build
bun run docs:check
bun run docs:build
bun run --cwd packages/llm-core format:check
git diff --check
```

## Work log

2026-08-08: Implementation started in the canonical shared checkout at base
`4c8cd971e73e2428d08cec3d219508b7bfdf5515`.

Execution mode: shared-checkout
Execution rationale: The canonical checkout is clean and the task has no active conflicts or overlapping writers.
Concurrency evaluation: aifsd/integration-kit-characterization; start alongside; its packages/aifsd integration and package-configuration scope appeared during verification and is disjoint from this task.
Concurrent task scopes: aifsd/integration-kit-characterization owns its packages/aifsd integration source, tests, package metadata, and build configuration.
Swarm delegation: none

2026-08-08: Replaced the projected semantic declaration with an immutable,
version-pinned operation matrix. Portable lifecycle and result operations are
separate from PydanticAI-owned tool, message-history, event, dependency,
session, checkpoint, and provider-state operations. The bridge protocol is now
`llm-core.pydantic-ai.bridge/v2`; this first implementation incorrectly kept
portable and native facts in one composite result and was superseded by the
review remediation below.

2026-08-08: Verification passed. The default conformance suite passed 14 tests
with two intentional exact-runtime skips. An isolated CPython 3.14 environment
with `pydantic-ai-slim==2.19.0` passed the complete conformance suite 16/16 with
no skips. Package typecheck, release build, SLOC, documentation checks and
build, package formatting, and `git diff --check` passed.

2026-08-08: Independent review returned two P1 findings and one P2 finding.
Remediation resumed: close and correlate the native observation boundary,
remove the unowned portable text-result claim, and bind every unsupported
operation to an executable negative fixture.

2026-08-08: The user explicitly rejected leaving the portable result
unsupported and directed this task to support it properly. Coordinator decision:
expand the task to the agent feature and its owned test-support/call-site
fixtures, replace unconstrained `AgentResult.output` JSON with a closed
kernel-owned output contract, and expose the PydanticAI native observation
through a genuinely separate adapter operation. No compatibility shim is
permitted.

2026-08-08: Remediation completed. `AgentResult.output` now accepts only the
kernel-owned text or JSON union, including persisted interaction turns. The
PydanticAI bridge returns the portable text result through `AgentRun.result()`
and exposes the exact native observation only through
`PydanticAiAgentRun.nativeResult()`. Native message, tool, usage, identity and
output facts are closed and correlated. Every unsupported operation matrix
entry points to an executable negative fixture.

2026-08-08: Final verification passed. The package release build ran 649 tests
with one unrelated optional Spec Kit fixture skip and no failures. The focused
default suites passed 99 tests with the two intentional exact-runtime skips;
the pinned `pydantic-ai-slim==2.19.0` suite passed 18/18 with no skips. Package
typecheck, documentation checks and build, formatting, SLOC, and
`git diff --check` passed.

2026-08-08: The closed-output migration necessarily updated three legacy test
modules already above the SLOC threshold. The coordinator refreshed their
versioned, expiring waivers in `scripts/sloc-baseline.json`; decomposition
remains owned by `architecture-test-sloc-decomposition`. This records the
user's decision that the existing module sizes are acceptable for this
contract correction without weakening the 500-line policy for new modules.

2026-08-08: A second independent review rejected the task with three P1
findings and one P2 finding. Remediation resumed to close the portable event
envelope, facts and identity; correlate native results to both the bridge run
and portable terminal text; narrow generic native support names to the exact
TestModel echo trajectory; and replace field-closure proxies with executable
native `output_type` and event-stream rejection operations.

2026-08-08: Second remediation completed. Portable lifecycle events now require
exact envelope, run identity and per-kind facts keys, real timestamps, strict
JSON data, and accessor-free inputs. Native-result responses carry the bridge
run identity and are checked against the run handle plus its cached portable
terminal text. Supported native claims now name only the TestModel echo string
tool trajectory and its exact four-message history. Native `output_type` and
event-stream operations have distinct bridge requests, explicit error codes,
matrix fixture anchors, scripted fixtures, and pinned-runtime executions.

2026-08-08: Verification passed for the task-owned surfaces. The pinned
`pydantic-ai-slim==2.19.0` suites passed 21/21 with no skips. Package release
build passed 652 tests with one unrelated optional Spec Kit skip. Typecheck,
documentation check and build, formatting, the 42-test SLOC policy suite, and
`git diff --check` passed. The conformance assertion and fixture modules are
468 and 225 lines. The repository-wide SLOC walk remains blocked only by six
untracked Python symlinks under the concurrent AIFSD integration fixture
scope; no task-owned SLOC error remains, and this task did not alter those
paths.

2026-08-08: A third independent review rejected one remaining P1 boundary.
Remediation moved strict-JSON registration ahead of every PydanticAI definition
and prompt field read. Preparation, validation and transport now consume only
the detached snapshots. Accessor-backed `effectRequirement` and `prompt`
fixtures reject with zero getter reads. SLOC was explicitly excluded from this
review decision and is not treated as a blocker.

2026-08-08: Third remediation verification passed. The pinned
`pydantic-ai-slim==2.19.0` suites passed 21/21 with no skips. Package release
build passed 652 tests with one unrelated optional Spec Kit skip. Typecheck,
documentation check and build, formatting, and `git diff --check` passed.

2026-08-08: The user approved the corrected runtime contracts and authorised
committing the related documentation and generic SLOC policy tooling. The
coordinator expanded this task's write scope to include that tooling because it
implements the repository's documented 500-line target and 600-line hard
boundary without changing the concurrent AIFSD integration implementation.
The task transitioned to `done` before staging and commit.

## Blocker

None. ADR-017 is accepted.

## Handoff

Approved task-scoped implementation at base
`4c8cd971e73e2428d08cec3d219508b7bfdf5515`, ready for commit.

- Execution mode: shared checkout on `main`.
- Concurrent scope: `aifsd/integration-kit-characterization` owns the disjoint
  AIFSD integration, package metadata, and build-configuration changes that
  appeared during verification.
- Changed implementation: closed kernel agent-output contract and consumers,
  runtime public front, exact operation matrix, native-result boundary,
  TypeScript bridge, Python bridge, and PydanticAI conformance fixtures.
- Changed adoption material: runtime conformance, agent, workflow,
  orchestration, and conformance-reference pages.
- Delegation: none.
- Deviations: none. No operation is classified `not-applicable`; the available
  exact-version evidence did not justify that disposition.
- Remaining risk: the Python operation matrix mirrors the TypeScript matrix as
  an intentional cross-language wire contract. Exact equality and the real
  process handshake are executable checks against drift.
