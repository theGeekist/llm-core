# ADR-009 — Specification Interoperability and Compilation

Architecture version: v2
Status: accepted
Date: 2026-07-30
Owners: architecture coordinator
Affected tasks: P2-300, P2-310, P2-315, P2-320, X1-400 through X1-445
Supersedes: ADR-008's fixed public-subpath list only

## Context

`llm-core` already provides portable execution, tool, evidence, state, context,
artifact and evaluation contracts. The next interoperability boundary is the
material that precedes execution: requirements, decisions, plans, workflow
intent and framework-specific specification documents.

The reviewed frameworks do not share one stable schema:

- OpenSpec is source- and lifecycle-oriented, with roots, references, sync and
  archive behavior.
- Spec Kit combines governance, overlays and control flow that cannot always be
  represented as an acyclic dependency graph.
- AI-SDLC treats decisions, admission, drift and attestations as first-class.
- BMAD emphasizes stable identities, append-only memory, preservation, source
  ownership and partial or blocked outcomes.

Treating one framework as canonical would leak its policy into the package.
Treating every specification as an untyped artifact would lose the semantics
needed to reconcile, validate, admit and project work safely.

`@wpkernel/pipeline` is being hardened as a domain-agnostic composition engine.
It can order helpers and stages, propagate output, wrap downstream execution,
report diagnostics, roll back work and support process-local suspension. Those
mechanics are useful here, but they do not define specification meaning or
durable LLM execution state.

## Decision

### Package and public boundary

- Keep specification interoperability in the existing package.
- Publish one new explicit front:
  `@geekist/llm-core/specifications`.
- Do not publish a generic `delivery` front. Delivery integrations remain
  qualified adapters until repeated usage establishes a coherent public
  capability.
- This ADR supersedes ADR-008 only where ADR-008 fixed the public subpath list.
  Its curated-root and explicit-front rules remain authoritative.

### Canonical model

- A source adapter produces a detached, immutable `SourceSnapshot` plus an
  import report. Import records what was observed; it never authorizes
  execution.
- Imported material is reconciled into a `SpecificationSet`: a typed semantic
  graph with stable node identities, typed relationships, source authority,
  provenance, decisions and unresolved questions.
- The canonical graph is not required to be acyclic.
- Resolution derives purpose-specific views:
  - a dependency DAG for readiness and compilation; and
  - a workflow program for branches, joins, loops and interventions.
- Admission is a separate application decision. An accepted outcome produces a
  portable `AcceptedSpecificationRecord`, but that record is not runtime
  authority.
- Projection requires a `RegisteredAcceptedSpecification`: a process-local,
  unforgeable value created only after completing admission or re-verifying the
  portable record against current authority, source revision, resolved digest,
  scope, policy versions and expiry.
- Registration proves provenance, not continuing validity. Every projection
  runs through an application-owned entrypoint that obtains a consistent
  current authority/policy/source snapshot, checks expiry at the final
  synchronous boundary and only then invokes the target projector.
- Projection results bind the authority snapshot used for validation.
  P2-315 makes controlled preparation, execution and resume recheck that
  binding before runtime construction or effects begin.
- The projection result is an envelope carrying the native/target-neutral value,
  projection identity and authority snapshot. Extracting the raw projection
  does not confer `llm-core` execution authority.
- After asynchronous authority or policy checks, every binding is rechecked
  immediately before runtime registration. Deserialization and process restart
  require registration again.
- Execution evidence, evaluations and drift may derive a portable
  `SpecificationChangeProposal` bound to the target source's base revision and
  digest. Proposal derivation is pure; authenticated source application is a
  separate adapter lifecycle operation.
- Durable checkpoints, execution receipts and attestations remain `llm-core`
  domain contracts. Pipeline pause snapshots are process-local mechanics and
  are never serialized as durable specification or execution state.

### Multi-format interoperability

- Formats are identified by a namespaced format identifier and explicit
  version.
- Importers and exporters declare direction, supported versions, conformance
  level and preserved extension namespaces.
- Every conversion returns an explicit fidelity result and structured issues.
  Unsupported semantics are reported as preserved, degraded or rejected; they
  are never silently discarded.
- Unknown native material may be retained only under validated reverse-DNS
  extension namespaces.
- The package does not promise a universal schema, lossless round trips or
  support for an entire framework merely because one format version can be
  parsed.

### Pipeline boundary

- `application/specification-compiler` owns cross-capability sequencing.
  Specification contracts remain in `features/specifications`.
- Source observation is an adapter boundary. The compiler accepts detached
  snapshots and runs:
  `import -> reconcile -> resolve -> admit -> project`.
- Pipeline owns ordering, helper composition, lifecycle mechanics, rollback,
  diagnostics and synchronous/asynchronous preservation.
- `llm-core` owns stage meanings, semantic state, authority, validation,
  admission, loss accounting and durable identities.
- Compilation is pure and creates a fresh Pipeline instance per invocation.
  WPKernel has implemented run-local diagnostics and run-wide rollback, but
  instance isolation remains the initial compiler posture until the forward
  exact release is qualified in `llm-core`.
- No initial compiler helper performs an external commit. WPKernel has
  implemented exactly-once commit and run-wide rollback, but source write-back
  requires a separately qualified `llm-core` capability after those guarantees
  exist in the exact released dependency.
- WPKernel has implemented and packed-qualified immutable replacement output
  and typed around-chain helpers. The Pipeline-backed implementation waits for
  the forward exact release artifact, not further output-composition design.
- The compiler's custom semantic stage sequence requires WPKernel's public
  typed custom-stage dependency facade. `llm-core` does not cast or recreate
  private Pipeline stage dependencies.
- WPKernel Phase 6 has implemented and packed-qualified that public facade,
  including cast-free inline `createStages` inference from root exports. The
  remaining P2-310 blocker is a forward published exact Pipeline version, not
  custom-stage API implementation.
- Process-local suspension is optional compiler machinery, not a portable
  contract dependency.

### Initial conformance scope

- The first implementation proves the canonical contracts, reconciliation,
  resolution, admission boundary and a target-neutral compiled plan.
- OpenSpec file/CLI import and PydanticAI `AgentSpec` projection are the first
  qualified adapter targets because they prove the delivery-source and
  runtime-target axes respectively.
- AI-SDLC follows to prove structured governance and evidence resources.
  Spec Kit and BMAD then follow as separately versioned adapters after their
  source ownership, overlay and control-flow mappings are characterized.

## Consequences

The package supports both sides of AI-first software delivery without becoming
an SDLC product: tools can exchange and reason about specification intent, and
accepted intent can be compiled toward the existing controlled execution
kernel. Framework churn is contained in qualified adapters. The semantic graph
can preserve richer source models while derived DAG and workflow views remain
fit for execution.

The core specification front increases the Architecture v2 package surface
from 19 to 20 entries. Qualified adapter implementations and publication are
separate X1 tasks so independent conformance work does not contend on shared
package metadata. ADR-010 governs their conditional public fronts and
coordinator-owned publication. Release verification must continue to test both
runtime and declaration imports from an isolated packed-package consumer.
