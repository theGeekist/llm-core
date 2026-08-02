> **Credit & provenance:** Replaces the earlier V2 implementation, architecture
> review, content review, and simplification handoffs. It carries forward their
> accepted language-rollout and review conclusions, the 19-framework assessment,
> and Architecture v2 ADRs/task briefs. Prepared by `codex-root` on 2026-08-01.
> The previous handoffs remain historical Git provenance; task briefs and ADRs
> below are the authority for all future work.

# Plan Architecture v2

## Purpose and current handoff point

`llm-core` is a typed control and interoperability kernel, not a hosted
platform, audit service, durable-work engine, secret manager, pricing catalogue,
or generic framework wrapper. The foundation is complete: all core tasks, the
accessible-language rollout, and the specification contracts → compiler →
authority chain are done.

At this handoff snapshot, 26 of 50 tasks are done, `specification-api` is in
review, and `capabilities-operational-evidence` is awaiting its review close.
When those two reviews are accepted and their implementers mark them `done`,
the program will be 28 of 50 tasks complete (56% by ticket count, not an effort
forecast). The remaining work divides into an independent specification-adapter
lane and an operational/runtime/integration lane.

## Repository map

Repository root: `/Users/jasonnathan/Repos/@theGeekist/llm-core`

```text
llm-core/
├── packages/llm-core/                 # the package being changed
│   ├── index.ts                       # curated package-root exports
│   ├── package.json                   # public subpaths and package metadata
│   ├── src/
│   │   ├── features/<capability>/      # capability rules + explicit public fronts
│   │   ├── application/                # cross-feature orchestration/compilers/runtimes
│   │   ├── adapters/                   # qualified framework/provider/protocol boundaries
│   │   ├── specifications/             # public ./specifications extension front
│   │   ├── agent|tool|workflow|conversation/ # common ready-object facades
│   │   └── shared/ and contracts/      # internal shared mechanics/portable contracts
│   ├── tests/                          # package, architecture, conformance, and adapter tests
│   └── internal/final-architecture/    # accepted design, ADRs, tasks, task protocol
├── docs/                               # public docs and these handoffs
├── examples/                           # consumers/examples; update only when task scope says so
└── AGENTS.md                           # repository-wide implementation guardrails
```

Placement rule: capability-specific behavior belongs in `src/features`; only
cross-feature sequencing belongs in `src/application`; a framework or protocol
belongs behind a qualified `src/adapters` boundary. Depend on another feature's
`public.ts`/declared front, never its internals.

## Read this before acting

1. [Repository guidance](../../AGENTS.md) — no compatibility shims, preserve
   `MaybePromise`, and do not disturb a dirty worktree.
2. [Architecture overview](../../packages/llm-core/internal/final-architecture/README.md),
   [task lifecycle](../../packages/llm-core/internal/final-architecture/tasks/README.md),
   and [coordination protocol](../../packages/llm-core/internal/final-architecture/COORDINATION.md).
3. [Live status board](../../packages/llm-core/internal/final-architecture/STATUS.md)
   and then the selected task brief; the brief wins if they differ.
4. The selected ADRs plus the relevant architecture guide:
   [specifications](../../packages/llm-core/internal/final-architecture/SPECIFICATIONS.md),
   [public language](../../packages/llm-core/internal/final-architecture/LANGUAGE.md),
   and [decisions index](../../packages/llm-core/internal/final-architecture/decisions/README.md).

## Historic constraints that remain live

- The language rollout removed compatibility aliases and `./functional`.
  Do not restore them; evolve one coherent public design and update call sites.
- Common package-root journeys are deliberately small: Agent, Tool, Workflow,
  Conversation, and the load/review/compile specification journey. Advanced
  lifecycle and framework mechanics use qualified fronts.
- Keep `MaybePromise` sync-or-async semantics. Use composition when it clarifies
  linear flow; do not force branching lifecycle code into point-free ceremony.
- Portable specification values do not grant execution authority. Accepted
  handles, compilation snapshots, and verification are process-private; the
  common Agent revalidates its private binding at preparation/execution.
- Adapter parsing does not imply semantic, compilation, lifecycle, or public
  support. Unknown meaning is namespaced portable data or a declared loss.
- Canonical evidence is not a trace, an estimate is not a provider charge, and
  a credential reference is not a credential or policy approval.

## Cadence and ownership

For every task: the user provides a task ID or asks what is ready next → the
primary implementer checks dependencies/ADRs and claims the selected task → it
implements within `write_scope` and submits its **uncommitted**, task-scoped
diff with changed files, exact verification, support/loss, and shared-file
requests → it marks `review` → the user relays the review → the implementer
fixes any P-level findings → reviewer passes → the implementer commits, records
the SHA, and marks `done` → only then select or claim the next task. The user
directs priorities and is the review relay; they do not need to make repository
changes from mobile.

Workers may swarm only under their task owner. Record disjoint child paths,
keep one writer per file, and keep adapters in isolated worktrees. Subagents do
not independently change task status or integrate. Preserve unrelated staged,
unstaged, and untracked work.

## Immediate roadmap

### Lane A — specification adapters

After `specification-api` is done, five qualification tasks are independently
ready and may run in parallel:

1. [OpenSpec](../../packages/llm-core/internal/final-architecture/tasks/adapter-openspec.md)
2. [PydanticAI AgentSpec](../../packages/llm-core/internal/final-architecture/tasks/adapter-pydantic-ai.md)
3. [AI-SDLC](../../packages/llm-core/internal/final-architecture/tasks/adapter-ai-sdlc.md)
4. [Spec Kit](../../packages/llm-core/internal/final-architecture/tasks/adapter-spec-kit.md)
5. [BMAD](../../packages/llm-core/internal/final-architecture/tasks/adapter-bmad.md)

They prove unlike source/runtime boundaries and each owns only its adapter,
fixtures, support declaration, loss report, and handoff. They must not edit
package exports or imply framework support before qualification. Each later
gets a separate `*-release` task; those five release tasks conflict and are
serialized because they edit shared package/build/docs files. The active
implementer handles one such shared-surface task at a time.

### Lane B — operational, runtime, and integrations

After operational evidence is done, claim
[runtime-receipt-reconciliation](../../packages/llm-core/internal/final-architecture/tasks/runtime-receipt-reconciliation.md)
first: it conflicts with the just-completed evidence task and unlocks the
durable-reference, workspace, and protocol path. In parallel, provided each
task has its own owner/worktree:

- [Strands runtime qualification](../../packages/llm-core/internal/final-architecture/tasks/adapter-strands-runtime.md)
  becomes ready after operational evidence.
- [Connector contracts](../../packages/llm-core/internal/final-architecture/tasks/integrations-connector-contracts.md)
  is already dependency-ready and unlocks
  [authorization lifecycle](../../packages/llm-core/internal/final-architecture/tasks/integrations-authorization-lifecycle.md).

Do not overlap Strands with
[cost intelligence](../../packages/llm-core/internal/final-architecture/tasks/capabilities-cost-intelligence.md):
their task briefs conflict. MCP/A2A protocol qualification waits for receipt
reconciliation, operational evidence, and connector authorization. The shared
client contract waits for specification API, authorization lifecycle, and cost
intelligence.

## ADR quick map

- [ADR-003](../../packages/llm-core/internal/final-architecture/decisions/ADR-003-schema-identity.md): portable JSON, identity, versioning, extensions.
- [ADR-004](../../packages/llm-core/internal/final-architecture/decisions/ADR-004-model-resolution.md): model/provider and credential ownership.
- [ADR-005](../../packages/llm-core/internal/final-architecture/decisions/ADR-005-tool-control-events.md): controlled effects, policy, approvals, receipts, cancellation.
- [ADR-006](../../packages/llm-core/internal/final-architecture/decisions/ADR-006-state-runner.md): state lifetimes and durable execution.
- [ADR-007](../../packages/llm-core/internal/final-architecture/decisions/ADR-007-packaging-conformance.md): conformance and package publication.
- [ADR-009](../../packages/llm-core/internal/final-architecture/decisions/ADR-009-specification-interoperability.md): canonical specification boundary.
- [ADR-010](../../packages/llm-core/internal/final-architecture/decisions/ADR-010-qualified-specification-adapter-publication.md): adapter qualification first, serialized publication second.
- [ADR-011](../../packages/llm-core/internal/final-architecture/decisions/ADR-011-accessible-public-language.md) and [ADR-012](../../packages/llm-core/internal/final-architecture/decisions/ADR-012-exact-public-vocabulary.md): exact common vocabulary and curated exports.
- [ADR-013](../../packages/llm-core/internal/final-architecture/decisions/ADR-013-operational-qualification-boundaries.md): evidence, durable effects, runtime and protocol qualification.
- [ADR-014](../../packages/llm-core/internal/final-architecture/decisions/ADR-014-integration-cost-client-application-boundaries.md): connectors, authorization, cost, and clients.

## Completion evidence

Run the selected brief's focused tests first. Changes to exports, types,
package build, docs, or task-specified shared files also require the task's
release/docs/packed-consumer gate. Do not substitute a broad green test count
for the exact task acceptance criteria. Always finish with `git diff --check`
and report whether the assigned worktree is clean.
