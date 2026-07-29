# llm-core Architecture v2 Implementation Plan

Architecture version: v2
Status: active
Coordinator: architecture/integration owner
Started: 29 July 2026

## Purpose

Implement the Architecture v2 `llm-core` posture established by the framework research:
a small, typed TypeScript interoperability and control kernel with explicit
capability boundaries, one orchestration surface and qualified framework
adapters.

The supporting research assessment is:

`/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/llm-core-support-assessment.md`

Existing `internal/stage-*.md` files remain historical evidence. This directory
is the authority for new architecture decisions, implementation tasks and live
progress.

Cross-swarm execution follows
[`COORDINATION.md`](COORDINATION.md).

## Non-negotiable implementation posture

- The package is pre-compatibility. Replace inferior APIs directly and update
  every call site, test, example and document in the same migration.
- Do not add aliases, compatibility shims, dual signatures or legacy serialized
  shapes unless a persisted deployment is explicitly placed in scope.
- Publish ESM only unless characterization proves a named current CommonJS
  consumer cannot migrate.
- Permit a justified Node baseline increase; the packaging gate records the
  chosen minimum and its evidence.
- Preserve `MaybePromise` and the current functional composition style.
- Keep one package initially. Use explicit subpath exports and split packages
  only after demonstrated peer-dependency, module-format, ownership or release
  pressure.
- New behavior begins in a capability slice. Cross-capability sequencing lives
  only in `application/`.
- Framework/provider types never cross adapter boundaries.
- Every feature exposes a `public.ts`; deep feature imports are prohibited.
- Root exports, package metadata, shared fixtures and deletion of old contracts
  are serialized integration-owner work.
- Complete and converge P0 before making a P1 task ready.
- Keep modules and tests below the existing 500-SLOC planning threshold where
  practical.

## Target topology

```text
packages/llm-core/src/
  contracts/
    identity.ts
    invocation.ts
    versioning.ts
    extensions.ts
    capabilities.ts
    schema.ts
    public.ts

  features/
    model/
    tooling/
    control/
    evidence/
    state/
    agent/
    retrieval/
    indexing/
    storage/
    memory/
    media/
    context/       # P1
    artifacts/     # P1
    evaluation/    # P1

  application/
    capability-bindings/
    tool-execution/
    workflow/
    recipes/
    agent/
    interaction/

  adapters/
    providers/
    frameworks/
    runtimes/
    ui/
    primitives/

  composition/
  services/
  shared/
```

Initial public fronts:

```text
@geekist/llm-core/contracts
@geekist/llm-core/model
@geekist/llm-core/tools
@geekist/llm-core/control
@geekist/llm-core/evidence
@geekist/llm-core/state
@geekist/llm-core/agent
@geekist/llm-core/workflow
@geekist/llm-core/interaction
@geekist/llm-core/adapters/ai-sdk
```

Do not expose the whole feature surface from the root package entry.

## Dependency direction

```text
shared
  ↑
contracts
  ↑
feature public surfaces
  ↑
application
  ↑
composition / delivery
```

Adapter rules:

- provider/framework adapters depend on contracts and feature public surfaces;
- runtime adapters implement the agent runner port;
- UI adapters depend only on the public interaction application contract;
- application receives ports through capability bindings and never imports
  concrete framework adapters;
- concrete factories and environment reads live in adapters/composition;
- feature-to-feature imports use public fronts and must be explicitly declared.

Expected feature dependencies:

- `model -> tooling/public` for normalized tool declarations;
- `agent -> model, tooling, control, evidence, state, context` public fronts;
- leaf features otherwise depend on contracts;
- policy → approval → execution → receipt coordination belongs in
  `application/tool-execution`.

## Canonical vocabulary

The naming ADR must ratify the exact surface, but implementation tasks use these
proposed names:

- `AgentSpec`, `AgentRunner`, `AgentRun`, `AgentRunRequest`, `RunResult`;
- `ModelRequest`, `ModelResponse`, `ProviderRequestMetadata`,
  `ProviderResponseMetadata`, `ModelProfile`;
- `ToolSpec`, `ToolCall`, `ToolResult`, `ToolExecutionReceipt`;
- `InvocationContext`, `ExecutionEvent`, `EventSink`;
- `PolicyDecision`, `ApprovalRequest`, `ApprovalDecision`,
  `InterventionRequest`, `ResumeStrategy`;
- `LiveContinuation`, `Snapshot`, `ResumableCheckpoint`,
  `DurableExecutionHandle`; and
- `Artifact` using the industry-standard spelling.

Qualify `Context`, `State`, `Memory`, `Task`, `Runtime`, `Profile`, `Result` and
`Thread`. Do not introduce bare forms.

## Architectural invariants

1. Portable contracts are JSON-compatible unless explicitly marked live.
2. IDs, schema versions and native-extension rules freeze before capability
   implementation.
3. Native provider objects never appear in portable fields.
4. Provider credentials and environment reads stay outside model resolution.
5. Policy evaluation, authenticated approval and effect execution are distinct.
6. Every non-read-only effect fails closed if its safe execution path cannot be
   established.
7. Every side-effecting tool follows one control path and emits intent and
   terminal receipts through a storage-neutral port.
8. `ExecutionEvent` is canonical, redacted before emission, and projected into
   interaction/provider streams.
9. Trace correlation is not an evidence ledger.
10. Live continuation, snapshot, checkpoint and durable execution handle are not
    interchangeable.
11. `AgentRunner` is the port; the local recipe runtime is one implementation.
12. `application/` is the only cross-capability orchestration layer.
13. Optional framework dependencies appear only under adapter entrypoints.
14. No guarantee-bearing field remains `unknown`.

## Decision gates

Implementation beyond characterization requires accepted ADRs for:

1. contract authority, topology and public fronts;
2. vocabulary and direct replacements;
3. schema authority, identity, versioning and native extensions;
4. model/provider/profile resolution and credential ownership;
5. action digest, policy, approval, effect and event semantics;
6. state lifetimes, checkpoint compatibility and runner lifecycle; and
7. AI SDK 7 module-format posture, conformance levels and second runtime.

See [`decisions/README.md`](decisions/README.md).

## Implementation waves

| Wave | Purpose                                                          | Entry gate                   | Exit gate                                                  |
| ---- | ---------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| A0   | Freeze decisions and ownership                                   | Research assessment complete | ADR-001 through ADR-007 accepted                           |
| I0   | Characterize the current public surface                          | None                         | Compile fixtures and blast-radius evidence stored          |
| P0.1 | Build narrow-waist contracts                                     | A0                           | Identity, invocation, version and extension contracts pass |
| P0.2 | Parallel model and tool/control/event slices                     | P0.1                         | Both vertical slices pass focused tests                    |
| P0.3 | State/intervention and agent runner                              | P0.2                         | Local runner uses the new lifecycle contracts              |
| P0.4 | Packaging gate, then parallel AI SDK and interaction conversions | P0.3 contracts frozen        | Dependency gate, adapter and session/UI suites pass        |
| P0.5 | Converge and delete old contracts                                | All P0 spokes in review      | No old public names/call sites; full CI passes             |
| P1.1 | Context, artifacts and evaluation                                | P0 converged                 | Provenance and real evaluation path pass                   |
| P1.2 | Conformance and second runtime                                   | P0 converged                 | Non-AI-SDK runner proves neutrality                        |
| X1   | External framework integrations                                  | Conformance levels stable    | Versioned support declarations exist                       |

## Dependency graph

```text
A0-001 ───────────────────────────────> P0-100
P0-100 ───────────────────────────────> P0-110 + P0-120
P0-110 ───────────────────────────────> P0-130
P0-110 + P0-120 ─────────────────────> P0-155 ──> P0-160
P0-110 + P0-120 + P0-130 ────────────> P0-140
P0-130 + P0-140 ─────────────────────> P0-170
I0-010 + P0-140 + P0-160 + P0-170 ──> P0-150
P0-150 ───────────────────────────────> P1-210
P0-150 + P1-210 ─────────────────────> P1-220
P0-150 + P0-160 + P0-170 ────────────> P1-230
```

## Parallelization rules

Parallel work is permitted only when:

- every shared noun is fixed by an accepted ADR;
- task dependencies are done;
- write scopes are disjoint;
- workers do not edit root exports, `package.json`, shared fixtures or canonical
  docs;
- one later convergence task owns shared barrels and deletion;
- independent Codex/Claude Code processes use separate worktrees; and
- the coordinator alone integrates or rebases task outputs.

Serialization points:

- canonical contract files and identity types;
- feature/root public barrels;
- package imports/exports and lockfile;
- `tests/fixtures/factories.ts`;
- public docs and migration notes;
- old-contract deletion and repository-wide renames.

The task claim is advisory, not a distributed lock. See the task template.

## Swarm allocation

The program is initially balanced at seven tasks for the Codex/coordinator
swarm and seven for the Claude Code swarm. The authoritative allocation and
integration protocol are in [`COORDINATION.md`](COORDINATION.md).

Claude Code owns, after decision and dependency gates clear:

- `I0-010` — characterize the current public API;
- `P0-120` — model/profile vertical slice;
- `P0-130` — state and intervention vertical slice;
- `P0-160` — AI SDK 7 adapter conversion;
- `P0-170` — session and UI projections;
- `P1-210` — context and artifact slices;
- `P1-220` — evaluation domain and recipe executor.

The Codex/coordinator swarm owns the complementary seven tasks, including
`P1-230` and selection of its first Python runtime.

These are planned allocations, not active claims. A task becomes assigned only
when `owner`, worktree, base SHA, branch, and lease fields are populated.

## Verification baseline

Focused tasks run their task-specific commands. Convergence runs:

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
```

Every worker records command, exit status and concise result in the task
handoff. “Tests passed” without commands is not evidence.

## Migration completion rules

- Port existing tests; do not delete coverage to make a replacement pass.
- Convert one end-to-end vertical slice before broad horizontal rewrites.
- Do not mix AI SDK 7 dependency migration with invention of neutral model
  semantics.
- Do not delete old contracts until all dependent spokes converge.
- Final searches must show no old public names, except historical documents.
- The package smoke test must validate every new public subpath.
- Existing stage documents and the research assessment remain historical
  rationale, not runtime dependencies.

## Ownership

| Area                                     | Owner role                     |
| ---------------------------------------- | ------------------------------ |
| ADRs, vocabulary, IDs, versioning        | architecture/contracts steward |
| Model contracts, profiles, resolver      | model owner                    |
| Tool schemas, effects, receipts          | tooling owner                  |
| Policy and intervention                  | control owner                  |
| Events, usage and evidence               | evidence owner                 |
| Continuation/checkpoint/durability       | state owner                    |
| Bindings, workflow, recipes, execution   | application owner              |
| Local runner, skills and delegation      | local-runtime owner            |
| Sessions, reducers and UI projections    | interaction owner              |
| Ecosystem translation                    | per-adapter owner              |
| Conformance levels and fixtures          | conformance owner              |
| Root exports, package metadata, deletion | integration owner              |

## Progress authority

- This plan is coordinator-owned.
- Each task file is the authoritative status for that task.
- Accepted ADRs are immutable; changes require a superseding ADR.
- [`STATUS.md`](STATUS.md) is a coordinator-maintained projection.
- Agent conversations, hidden memory and local todo lists are never required to
  resume work.
