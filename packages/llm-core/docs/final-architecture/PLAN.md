# llm-core Architecture v2 Kernel Plan

Architecture version: v2
Status: kernel complete; continuing programmes tracked separately
Coordinator: architecture/integration owner
Started: 29 July 2026
Completed: 1 August 2026
Completion milestone: `9920425`

## Purpose

Architecture v2 replaced `llm-core` with a small, typed TypeScript
interoperability and control kernel. This plan records the completed kernel:
architecture, baseline, core, capabilities, language and specification
compilation/admission. Qualification, integrations, adapter publication and
products continue independently in [`ROADMAP.md`](ROADMAP.md).

External framework research informed this plan but remains non-authoritative
provenance; current work does not depend on sibling-repository state. Historical
`v1-*.md` records are indexed from the
[`llm-core` package documents](../README.md) and are likewise explicitly
non-authoritative. This directory is the authority for Architecture v2
decisions, task briefs and status.

## Completed posture

- ESM-only package with a justified runtime baseline and isolated packed-package
  verification.
- One package with curated subpath exports; package splits require measured
  pressure under ADR-015.
- Portable contracts and native extensions remain explicitly separated.
- Capability behavior starts in feature slices; cross-capability sequencing is
  confined to `application/`.
- Framework and provider types stop at adapter boundaries.
- Controlled effects use one policy, approval, digest, receipt and evidence
  path.
- `ExecutionEvent` is canonical and redacted before projection.
- `AgentRunner` is the runtime-integration port; concrete runners are qualified
  adapter implementations.
- The local TypeScript runner is private conformance evidence, not a supported
  runtime, package front or common application journey.
- Public language expresses portable intent without implying that the kernel
  owns agent, workflow or conversation execution.
- Specifications use a typed semantic graph, exact operation dispositions,
  application-owned admission and authority snapshots.
- Pipeline supplies domain-agnostic composition; `llm-core` owns specification
  meaning, authority and durable state.

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

Adapters depend on contracts and curated feature fronts. Application receives
ports through capability bindings and does not import concrete framework
adapters. Package-level fronts may aggregate feature and application exports;
features do not import upward into application orchestration.

## Completed stages

| Stage          | Outcome                                                                                               | Completion evidence |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| Architecture   | Contract, topology, control and ownership decisions accepted                                          | ADR-001–ADR-008     |
| Baseline       | Previous public surface and migration blast radius captured                                           | `api-baseline`      |
| Core           | Runtime kernel and curated fronts converged                                                           | `core-convergence`  |
| Capabilities   | Context, artifacts, evaluation and runtime conformance added                                          | capability tasks    |
| Language       | Public vocabulary rolled out; runnable facades later superseded by ADR-016                            | `language-rollout`  |
| Specifications | Typed application/agent semantic waist, portable compiler targets, authority and public API completed | `specification-api` |

The kernel dependency graph terminates at `specification-api`:

```text
architecture + baseline
  -> core
      -> capabilities
          -> language
              -> specification contracts
                  -> compiler
                      -> authority
                          -> specification API
```

The completed kernel milestone is `9920425`. Subsequent receipt hardening and
five specification-adapter qualifications are post-kernel evidence; they do
not move the completion boundary.

## Public surface baseline

The original completion baseline contained 30 ESM runtime and declaration
entrypoints. ADR-016 removes the fronts that presented private proof executors
as common product runtime. The package root is contract- and
specification-oriented. New root exports are denied by default, and a new
subpath requires a task-specific qualification and coordinator-owned
publication decision.

The Pipeline dependency is the published, pinned and packed-qualified
`@wpkernel/pipeline@1.2.0`. Its typed replacement state, `next(output?)`, sync
preservation and public stage facade are composition substrate, not LLM-domain
contracts.

## Completion evidence

- All kernel task dependencies are `done`.
- The original public vocabulary and packed journeys passed their implementation
  gates. ADR-016 records that runnable Agent, Workflow and Conversation journeys
  were nevertheless the wrong ownership boundary and are not continuing
  architecture authority.
- Specification admission, provenance, projection and post-projection
  authority verification are represented in the public specification path.
- Full release checks and isolated packed-consumer verification passed at the
  completion milestone.
- Public additions after this point require a continuing-programme task and do
  not silently reopen this plan.

## Continuing work

[`ROADMAP.md`](ROADMAP.md) groups four independently prioritizable programmes;
task front matter owns their exact dependency graph:

- Qualification
- Integrations
- Adapters
- Products

ADR-013 and ADR-014 bound that work. ADR-015 establishes the completion line,
evidence-before-abstraction rules, publication lifecycle and package-split
triggers. ADR-016 restores integration-owned execution and places any AIFSD
SDK, CLI or client product above the kernel. No roadmap item is an active claim
merely because its dependencies are satisfied.

## Verification baseline

Focused tasks run their named checks. Any task changing package exports,
declaration/build entrypoints, TypeScript mappings, package smoke expectations
or public documentation also runs:

```sh
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

Repository-wide results normally use a quiescent primary checkout. A dedicated
worktree is acceptable only when its last-resort isolation rationale is
recorded. Focused task results remain valid during disjoint shared-checkout
work.

## Progress authority

- Accepted ADRs define architecture decisions.
- Task front matter is authoritative for task state and dependencies.
- [`STATUS.md`](STATUS.md) is the coordinator-generated human projection. It is
  manually audited until `architecture-status-validation` makes rendering and
  agreement mechanical; lifecycle transitions update task front matter and the
  projection together.
- [`COORDINATION.md`](COORDINATION.md) defines claims, boundary-driven execution
  modes, optional swarms, review and integration.
- Conversations and uncommitted worktree state are never required inputs.
