# Specification Interoperability Architecture

Architecture version: v2
Decision authority:
[`ADR-009`](decisions/ADR-009-specification-interoperability.md)
Implementation stage: specifications

ADR-012 ratified the public names used by this completed specification stage.
The internal authority boundaries remain required even when the common API
hides their machinery.

## Outcome

`llm-core` gains a specification interoperability layer without becoming a
software-delivery platform and without treating any external framework as the
canonical model.

The layer serves two distinct AI-first software delivery use cases:

1. **Delivery-method interoperability** — observe, import and reconcile
   requirements, plans, decisions and work artifacts from systems such as
   OpenSpec, Spec Kit, AI-SDLC and BMAD.
2. **Runtime-specification interoperability** — compile accepted intent into
   portable agent, workflow, tool, context, evaluation and execution contracts,
   including runtime-oriented formats such as PydanticAI `AgentSpec`.

These use cases share identity, provenance, loss accounting and review, but
they do not share one universal source schema.

## Package shape

Keep one npm package:

```text
@geekist/llm-core/specifications
```

The front aggregates the portable specification feature and its application
compiler. It does not re-export framework packages or provider-native values.

Framework integrations remain qualified:

```text
@geekist/llm-core/adapters/openspec
@geekist/llm-core/adapters/pydantic-ai-spec
@geekist/llm-core/adapters/ai-sdlc
@geekist/llm-core/adapters/spec-kit
@geekist/llm-core/adapters/bmad
```

Those adapter fronts are added only when their individual verification and
coordinator-owned publication tasks are complete. They do not block the core
`./specifications` front and are not part of the specifications stage's initial
30-entry package
gate.

Do not add a broad `./delivery` front. It would combine source lifecycle,
project policy, orchestration and product concerns that do not yet form one
cohesive capability.

## The eight boundaries

| Reader-facing boundary    | Internal responsibility | Input                                                         | Output                                                       | Authority                                                                    |
| ------------------------- | ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1. Load source            | Observe                 | External files, CLI output, API resources or runtime specs    | Detached source snapshot                                     | Adapter records what existed; it does not interpret or authorize             |
| 2. Read format            | Import                  | Versioned snapshot                                            | Imported nodes, relationships and conversion report          | Format adapter owns parsing and source-version compatibility                 |
| 3. Combine specifications | Reconcile               | One or more imports                                           | Canonical specification graph                                | Core owns identity, provenance, source authority and conflict representation |
| 4. Check specification    | Resolve                 | Canonical semantic graph                                      | Checked specification plus diagnostics                       | Core derives references, requirements and unresolved questions               |
| 5. Build plans            | Derive views            | Checked graph                                                 | Dependency plan and workflow program                         | Each view declares which relationship kinds it interprets                    |
| 6. Decide                 | Admit                   | Checked specification, policy decisions and evidence          | Specification decision and, when accepted, a portable record | Application policy or authenticated human authority; never the importer      |
| 7. Compile                | Project                 | Runtime-verified accepted specification plus target           | Target-neutral execution plan or framework-native value      | Compiler reports exact, changed and unsupported semantics                    |
| 8. Propose changes        | Reconcile feedback      | Execution receipts, evaluations, drift and produced artifacts | Proposed specification change with lineage                   | Evidence may propose a change; only the source owner may accept it           |

The eighth boundary closes the lifecycle without creating an unsafe write-back
loop. Runtime evidence can show that intent and implementation diverged, but
`llm-core` never overwrites authoritative OpenSpec, Spec Kit, AI-SDLC or BMAD
material silently.

## Canonical state model

These are internal architecture names, not a required public call sequence.
`language-vocabulary` decides which values remain publicly named.

```text
SpecificationSourceSnapshot
  ├── format identity and detected version
  ├── observed-at time and source revision
  ├── root documents and referenced documents
  ├── source role: primary | overlay | reference | generated
  ├── authority: authoritative | advisory | informative
  └── namespaced native extensions

SpecificationGraph
  ├── stable set identity and contract version
  ├── source snapshots
  ├── typed semantic nodes
  ├── typed relationships
  ├── source bindings and provenance
  └── reconciliation diagnostics

CheckedSpecification
  ├── reconciled semantic graph
  ├── resolved references
  ├── decisions and open questions
  ├── conflicts and blocked items
  ├── dependency view
  └── workflow view

SpecificationDecision
  ├── accepted
  │   └── record: SpecificationDecisionRecord
  │       ├── resolved-specification digest
  │       ├── specification decision and evidence
  │       ├── accepted scope
  │       ├── policy/version bindings
  │       ├── source revision/digest bindings
  │       └── expiry or invalidation conditions
  ├── rejected
  └── needs-input

AcceptedSpecificationHandle
  ├── verified SpecificationDecisionRecord
  ├── current resolved specification
  └── module-private runtime provenance (origin, not continuing validity)

CompilationAuthoritySnapshot
  ├── checked-at time
  ├── resolved-specification digest
  ├── policy/version bindings
  ├── source revision/digest bindings
  └── authority and accepted scope

ProposedSpecificationChange
  ├── target source and format
  ├── base source revision and digest
  ├── proposed semantic changes
  ├── originating accepted-specification record
  ├── execution/evaluation evidence
  └── conversion report
```

The source snapshot, graph, checked value, decision record and change proposal are
distinct portable branded contracts. Brands provide compile-time separation;
they are not execution authority.

`AcceptedSpecificationHandle` is a live, process-local value recorded in a
module-private provenance registry. It can be obtained only by completing
review or verifying a `SpecificationDecisionRecord` against current authority,
source revision, resolved digest, accepted scope, policy versions
and expiry. Registration proves origin; it does not make acceptance timeless.

After asynchronous authentication or policy evaluation, the review path
rechecks every binding immediately before runtime registration. Deserialization
or a process restart discards runtime authority and requires the portable
record to be verified again.

Every compilation enters through the application-owned
`compileSpecification` path. That path verifies runtime provenance,
obtains one consistent `CompilationAuthoritySnapshot` from trusted authority,
policy and source-revision ports, then checks expiry with a trusted clock at the
final synchronous boundary before invoking a compiler or adapter. Adapters implement
translation; they do not duplicate or bypass decision validity.

The result is a `CompiledSpecification<T>` that binds the native or
target-neutral compiled value to the exact authority snapshot used. Compilation
is pure, so a concurrent change after that snapshot creates a stale result
rather than an unauthorized effect.

specification-compiler owns the internal `verifyCompilationAuthority`.
specification-authority integrates it into
every `llm-core`-controlled agent/workflow preparation, execution and resume
gateway capable of consuming a compiled specification. Preparation validates immediately
before creating a runtime object; execution and resume validate again
immediately before effects. Durable state retains the compilation identity and
authority snapshot needed for revalidation.

Extracting `T` from `CompiledSpecification<T>` removes `llm-core` execution
authority. A raw native value may be used by an external framework under that
framework's controls, but it cannot enter an `llm-core` preparation or
execution gateway without its authority-bound wrapper and successful current
validation.

## Graph, DAG and workflow semantics

The canonical `SpecificationGraph` is a typed directed multigraph:

- parallel relationships are valid when their identity, source or semantics
  differ;
- cycles are valid for relationships such as `relates`, `refines`,
  `conflicts`, `supersedes` and iterative workflow transitions;
- unresolved and contradictory material is represented, not normalized away;
- decisions and questions are first-class nodes rather than free-form
  metadata; and
- stable source bindings preserve the owning document and optional location.

Two views are derived from that graph:

### Dependency view

The dependency view interprets only declared dependency-bearing relationship
kinds. It must be acyclic to become ready. A cycle produces a structured
resolution diagnostic and blocks acceptance for the affected scope; it does not
invalidate the entire semantic graph.

### Workflow view

The workflow view is a program, not a DAG. It may contain branches, joins,
bounded loops, review/repair cycles, intervention points and terminal partial
or blocked outcomes. Execution engines receive this view only after review.

## Format and support model

Every adapter declares:

- a namespaced format identifier;
- detectable supported versions or version ranges;
- operation: import, export or both;
- supported formats, versions, operations and features;
- preserved native-extension namespaces;
- source ownership and write-back behavior; and
- fixtures used to substantiate the claim.

Support levels are cumulative only when explicitly declared:

| Level       | Claim                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Syntax      | The adapter can detect and parse the declared format version             |
| Semantic    | Required source meaning maps into canonical nodes and relationships      |
| Compilation | An accepted canonical subset can be compiled for the target              |
| Round trip  | Declared semantics survive import and export within tested bounds        |
| Lifecycle   | Source-specific sync, archive or write-back behavior is supported safely |

Every import and adapter conversion returns a conversion report:

```text
fidelity: exact | partial | rejected
issues[]:
  code
  severity
  disposition: preserved | degraded | rejected
  source location or canonical node identity
  explanation
```

No adapter may claim framework support merely because it parses JSON or
Markdown. Unknown fields are retained only as strict JSON under validated
reverse-DNS extension namespaces.

## Initial support order

| Order | Integration                        | Why                                                                                                 |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | OpenSpec file/CLI import           | Proves roots, references, current truth, deltas, validation and archive-aware source ownership      |
| 2     | PydanticAI `AgentSpec` compilation | Proves the other interoperability axis: canonical accepted intent to a typed runtime specification  |
| 3     | AI-SDLC JSON import                | Proves structured cross-language resources, decisions, review metadata and evidence-oriented fields |
| 4     | Spec Kit file/CLI import           | Adds constitutions, overlays, templates and branch/join/loop workflow semantics                     |
| 5     | BMAD file/CLI import               | Adds stable planning identities, append-only memory, preservation and partial/blocked outcomes      |

OpenSpec and PydanticAI are the first pair because they prove unlike boundaries,
not because either is the universal model. AI-SDLC is next because its
structured resources stress governance and evidence. Spec Kit and BMAD require
weaker, separately versioned file/CLI claims until they publish stable,
comprehensive runtime schemas. This is release preference, not an architectural
dependency between adapter implementations.

## Pipeline integration

Source loading stays in framework adapters because it may perform file,
CLI or API I/O. The application compiler accepts detached snapshots and uses
Pipeline for the remaining mechanics:

```text
read -> combine -> check -> decide -> compile
```

The compiler owns one typed immutable state value for a run. Helpers may
replace that state. Around helpers may call `next(replacement)` and inspect the
final downstream state.

Pipeline does not know about any state field or stage meaning. In particular,
`providedKeys` is not treated as a cross-stage semantic dependency system.
Stage order supplies control ordering; typed compiler state carries data.

### Capability gates

| WPKernel capability                                     | Required for initial compiler?   | `llm-core` response                                                                                                       |
| ------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Authoritative returned output and typed `next(output?)` | Implemented and packed-qualified | Use the published forward version; do not bind to the stale local manifest                                                |
| Sync-preserving composition                             | Implemented and packed-qualified | Preserve the package-wide `MaybePromise` contract                                                                         |
| Run-wide rollback                                       | No for pure compilation          | Implemented upstream; required before helpers acquire reversible external resources                                       |
| Exactly-once commit                                     | No for pure compilation          | Implemented upstream; required before any compiler stage performs source write-back                                       |
| Public step shape and deduplicated edges                | Implemented and packed-qualified | Use for deterministic traces and dependency registration                                                                  |
| Run-local diagnostics                                   | Implemented and verified         | Retain invocation-owned diagnostics; still construct one Pipeline instance per initial compile invocation                 |
| Typed custom-stage API                                  | Implemented and packed-qualified | Use the public `PipelineStageDependencies` family with inferred inline `createStages`; do not cast private Pipeline types |
| Process-local suspension boundary                       | Not a compiler dependency        | Never expose it as a durable `llm-core` checkpoint                                                                        |

The release gate is the packed `@wpkernel/pipeline@1.2.0` artifact, not an
unpublished monorepo checkout. `llm-core` pins that exact tested version and
lockfile integrity.

### Current WPKernel compiler API evidence

WPKernel Phase 6 is implemented and documented. The root public type family is:

- `AgnosticPipelineOptions`;
- `PipelineStageDependencies`;
- `PipelineStageState`;
- `PipelineStageResult`;
- `PipelineStage`;
- `PipelineHelperStageOptions`;
- `PipelineRegisteredHelper`;
- `PipelineHelperRollback`;
- `PipelineStageDiagnostics`; and
- `PipelineHalt`.

The packed external-consumer fixture proves root-only imports, cast-free inline
`createStages` inference, invalid kind/state/stage rejection, immutable
replacement state, typed `next(output?)` and fully synchronous completion. The
reusable gate is:

```sh
pnpm --filter @wpkernel/pipeline qualify:packed
```

The 31 July 2026 release gate was the pre-specification baseline: the package
release build passed 515 tests with one optional compatibility skip, and the
isolated packed consumer verified the then-current 19 ESM runtime and
declaration entrypoints against Pipeline 1.2.0. That result removed the
WPKernel dependency blocker; the contract and vocabulary gates named at the
time were subsequently completed.

The final Architecture v2 qualification at commit `9920425` verified all 30
ESM runtime and declaration entrypoints, including the completed specification
contracts, compiler, authority enforcement and public API. There are no
remaining specification-stage gates in the kernel. Later adapter qualification
and publication decisions are continuing-programme work and do not reopen this
completion boundary.

## Error and evidence posture

- Malformed, proxy-backed, accessor-backed, cyclic, sparse or symbol-bearing
  portable values fail at the boundary before semantic reads.
- Media types, digests, IDs, versions and timestamps receive semantic
  validation, not regex-only acceptance.
- Duplicate canonical identities and dangling source/relationship references
  fail closed.
- Conflicting authoritative sources become explicit conflicts.
- Advisory material cannot silently override authoritative material.
- Specification decisions bind the exact resolved-specification digest, scope,
  policy versions and evidence.
- Runtime decision provenance is unforgeable and process-local. A TypeScript
  brand or reconstructed portable record is insufficient for compilation.
- Runtime provenance proves how acceptance was obtained, not whether it remains
  current. Every compilation revalidates expiry, authority, policy versions,
  source revisions, resolved digest and scope through trusted ports.
- A later source revision, expired decision or changed policy invalidates the
  accepted value rather than mutating it.
- Compiled results bind their `CompilationAuthoritySnapshot`; preparation or
  execution rejects them after authority drift.
- Controlled preparation, execution and resume accept a
  `CompiledSpecification<T>`, never a raw native value as evidence of
  acceptance.
- Execution receipts and evaluations retain lineage to the accepted
  specification and compiled result.
- Evidence and drift may derive a `ProposedSpecificationChange` without
  external effects. Applying it is a separate adapter lifecycle operation
  requiring authenticated source authority, base-revision compare-and-swap,
  stale-proposal rejection and a durable application receipt.

## Completed implementation sequence

1. The language stage settled the public language and proved the common
   journeys.
2. `specification-contracts` defined and validated snapshots, semantic graphs,
   conversion reports, portable specification decision records, change
   proposals and adapter capabilities.
3. `specification-compiler` added reconciliation, resolution, derived views,
   review and the pure Pipeline-backed compiler after the WPKernel release gate.
   It owns runtime registration of accepted specifications and authority-bound
   compiled results; its authority-snapshot verifier remains internal.
4. `specification-authority` integrated post-compilation authority verification
   into controlled preparation, execution and resume paths and proved rejection
   before effects.
5. `specification-api` published `./specifications`, added the common
   specification journey to the root and verified the 30-entry packed package.
6. `adapter-openspec`, `adapter-pydantic-ai`, `adapter-ai-sdlc`,
   `adapter-spec-kit` and `adapter-bmad` implemented independent adapter mappings
   and verification fixtures.

## Continuing specification work

1. The five coordinator-owned adapter publication tasks may serialize package
   metadata and packed-consumer changes after their exact-version support gates
   pass.
2. A later source-application task may apply change proposals only after its
   adapter proves authenticated ownership, optimistic concurrency, stale
   rejection, conversion-loss handling and durable receipts.

## Evidence base

The design is grounded in the local framework assessments:

- `/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/openspec.md`
- `/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/spec-kit.md`
- `/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/ai-sdlc.md`
- `/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/bmad-method.md`
- `/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/pydantic-ai.md`
- `/Users/jasonnathan/Repos/aifsd-agent-framework-research/DEPENDENCY-REUSE-BOUNDARIES.md`

The WPKernel adoption gates are derived from:

- `/Users/jasonnathan/Repos/@wpkernel/docs/packages/pipeline/hardening-plan.md`

## Deliberate non-goals

- no universal SDLC schema;
- no hosted specification store, portal, issue tracker or approval inbox;
- no implicit execution on import;
- no silent source write-back;
- no claim of lossless cross-framework conversion;
- no framework lifecycle in the package root;
- no durable checkpoint built from Pipeline's process-local suspension; and
- no custom Pipeline fork or LLM-specific helper kinds in WPKernel.
