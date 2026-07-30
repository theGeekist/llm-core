# llm-core Architecture v2 Implementation Plan

Architecture version: v2
Status: active
Coordinator: architecture/integration owner
Started: 29 July 2026

## Purpose

Implement the Architecture v2 `llm-core` posture established by the framework research:
a small, typed TypeScript interoperability and control kernel with explicit
capability boundaries, one orchestration surface, specification compilation
and qualified framework adapters.

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
- Complete and converge the core stage before starting capability expansion.
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
    context/       # capabilities stage
    artifacts/     # capabilities stage
    evaluation/    # capabilities stage
    specifications/ # specifications stage

  application/
    capability-bindings/
    tool-execution/
    workflow/
    recipes/
    agent/
    interaction/
    specification-compiler/ # specifications stage

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

Curated public fronts after the language rollout:

```text
@geekist/llm-core
@geekist/llm-core/agent
@geekist/llm-core/tools
@geekist/llm-core/workflow
@geekist/llm-core/conversation
@geekist/llm-core/model
@geekist/llm-core/control
@geekist/llm-core/context
@geekist/llm-core/artifacts
@geekist/llm-core/evaluation
@geekist/llm-core/agent/runtime
@geekist/llm-core/tools/runtime
@geekist/llm-core/workflow/runtime
@geekist/llm-core/model/runtime
@geekist/llm-core/control/runtime
@geekist/llm-core/contracts
@geekist/llm-core/evidence
@geekist/llm-core/state
@geekist/llm-core/interaction
@geekist/llm-core/retrieval
@geekist/llm-core/indexing
@geekist/llm-core/storage
@geekist/llm-core/memory
@geekist/llm-core/media
@geekist/llm-core/adapters/ai-sdk
@geekist/llm-core/adapters/ai-sdk-ui
@geekist/llm-core/adapters/assistant-ui
@geekist/llm-core/adapters/openai-chatkit
@geekist/llm-core/adapters/nlux-ui
```

The specifications stage adds `@geekist/llm-core/specifications`; qualified
framework adapters are added only after their own release gates. `./functional`
is removed. Do not expose the whole feature surface from the root package
entry.

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

## Public language

The complete audit and journey contracts are in
[`LANGUAGE.md`](LANGUAGE.md). ADR-011 places a dedicated language stage before
specification work.

Architecture v2 keeps three language levels:

- common application language built from familiar nouns such as agent, tool,
  workflow, conversation, specification, run, result, approval and plan;
- explicit extension language for runtimes, stores, adapters, policies,
  receipts, checkpoints and compatibility; and
- internal lifecycle language for bindings, registration provenance, authority
  snapshots, envelopes, claims and coordinator journals.

ADR-011 establishes the language levels and usability gate. language-vocabulary proposes
ADR-012 with the exact replacement map. Until ADR-012 is accepted, existing
names describe the shipped v2 surface but are not authority for new specification
names. Do not add aliases or make internal lifecycle machinery a required step
in a common journey.

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
15. Specification import records observed intent and never authorizes
    execution.
16. The canonical specification model is a typed semantic graph; dependency
    DAGs and workflow programs are derived purpose-specific views.
17. Every cross-format conversion reports preserved, degraded and rejected
    semantics explicitly.
18. Pipeline owns generic composition mechanics; `llm-core` owns
    specification meaning, authority, admission and durable state.
19. Common APIs express user intent. Preparation, binding, registration,
    projection and authority verification remain automatic unless the caller is
    implementing that extension boundary.

## Decision gates

Implementation beyond characterization requires accepted ADRs for:

1. contract authority, topology and public fronts;
2. vocabulary and direct replacements;
3. schema authority, identity, versioning and native extensions;
4. model/provider/profile resolution and credential ownership;
5. action digest, policy, approval, effect and event semantics;
6. state lifetimes, checkpoint compatibility and runner lifecycle;
7. AI SDK 7 module-format posture, conformance levels and second runtime; and
8. specification interoperability, source authority, admission and Pipeline
   ownership; and
9. qualified specification-adapter publication and serialized package
   integration; and
10. accessible public language, progressive disclosure and common-journey
    usability.

See [`decisions/README.md`](decisions/README.md).

## Implementation stages

| Stage          | Purpose                                             | Entry gate                    | Exit gate                                               |
| -------------- | --------------------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| Architecture   | Freeze decisions and ownership                      | Research assessment complete  | Foundational ADRs accepted                              |
| Baseline       | Characterize the current public surface             | None                          | Compile fixtures and blast-radius evidence stored       |
| Core           | Build and converge the runtime kernel               | Architecture decisions frozen | Old contracts removed and full CI passes                |
| Capabilities   | Add context, artifacts, evaluation and conformance  | Core converged                | Provenance and runtime-neutral conformance proven       |
| Language       | Settle and roll out the public language atomically  | Capabilities complete         | Packed common journeys use no internal vocabulary       |
| Specifications | Add specification contracts, compiler and authority | Language rollout complete     | Packed specification API and authority checks pass      |
| Adapters       | Add qualified framework integrations                | Specification API complete    | Versioned support declarations and packed adapters pass |

## Dependency graph

```text
architecture-decisions ───────────────────────────────> core-contracts
core-contracts ───────────────────────────────> core-tool-control-events + core-model-runtime
core-tool-control-events ───────────────────────────────> core-state-interventions
core-tool-control-events + core-model-runtime ─────────────────────> core-ai-sdk-packaging ──> core-ai-sdk-adapter
core-tool-control-events + core-model-runtime + core-state-interventions ────────────> core-agent-runner
core-contracts + core-model-runtime + core-ai-sdk-adapter ────────────> core-knowledge
core-contracts + core-model-runtime + core-state-interventions + core-ai-sdk-adapter ──> core-conversations
core-contracts + core-model-runtime + core-agent-runner + core-ai-sdk-adapter ──> core-media-schemas-skills
core-knowledge + core-conversations + core-media-schemas-skills ────────────> core-capability-bindings
core-state-interventions + core-agent-runner + core-ai-sdk-adapter ───────────> core-interactions
api-baseline + core-capability-bindings + core-interactions ────────────> core-convergence
core-convergence ───────────────────────────────> capabilities-context-artifacts
core-convergence + capabilities-context-artifacts ─────────────────────> capabilities-evaluation
core-convergence + core-ai-sdk-adapter + core-interactions ────────────> capabilities-runtime-conformance
capabilities-context-artifacts + capabilities-evaluation + capabilities-runtime-conformance ────────────> language-audit
language-audit + ADR-011 ────────────────────> language-vocabulary ──> ADR-012
ADR-012 ─────────────────────────────> language-rollout
language-rollout + ADR-009 ────────────────────> specification-contracts
specification-contracts ────────────────────────> specification-compiler
specification-compiler ───────────────────────────────> specification-authority
specification-authority ───────────────────────────────> specification-api
specification-api ───────────────────────────────> adapter-openspec + adapter-pydantic-ai + adapter-ai-sdlc + adapter-spec-kit + adapter-bmad
adapter-openspec + ADR-010 ────────────────────> adapter-openspec-release
adapter-pydantic-ai + ADR-010 ────────────────────> adapter-pydantic-ai-release
adapter-ai-sdlc + ADR-010 ────────────────────> adapter-ai-sdlc-release
adapter-spec-kit + ADR-010 ────────────────────> adapter-spec-kit-release
adapter-bmad + ADR-010 ────────────────────> adapter-bmad-release
```

The WPKernel Pipeline release gate is complete. `llm-core` pins the published
`@wpkernel/pipeline@1.2.0` artifact and its lockfile integrity, passes the full
release build, and verifies all 19 ESM runtime and declaration entrypoints from
an isolated packed consumer. The release provides helper replacement output,
typed `next(output?)`, synchronous preservation, public step shape,
duplicate-edge handling, run-local diagnostics and cast-free inline
`createStages` inference through the public `PipelineStageDependencies` family.

WPKernel's reusable pre-release evidence command remains:

```sh
pnpm --filter @wpkernel/pipeline qualify:packed
```

Run-wide rollback and exactly-once commit are implemented upstream but are not
semantic requirements for the initial pure compiler. Process-local suspension
is not an `llm-core` durable-checkpoint dependency.

## Parallelization rules

Parallel work is permitted only when:

- every shared noun is fixed by an accepted ADR;
- task dependencies are done;
- write scopes are disjoint;
- workers do not edit root exports, `package.json`, shared fixtures or canonical
  docs;
- one later convergence task owns shared barrels and deletion;
- independent Codex subagents use separate worktrees; and
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

Claude Code's completed api-baseline and core-model-runtime contributions remain historical.
Every remaining Architecture v2 task is owned by the Codex/coordinator swarm.
The coordinator uses parallel child agents with disjoint write scopes and
retains task leases, review responsibility and deterministic integration.

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

Every task that changes package exports, build/declaration entrypoints,
TypeScript mappings, package smoke expectations or public documentation also
runs:

```sh
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

Focused adapter and architecture tests supplement this release gate; they never
replace it.

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
- Accepted ADRs are authoritative unless superseded; changes require a superseding ADR.
- [`STATUS.md`](STATUS.md) is a coordinator-maintained projection.
- Agent conversations, hidden memory and local todo lists are never required to
  resume work.
