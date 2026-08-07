# ADR-017 — Exact External Contract Fidelity

Architecture version: v2
Status: accepted
Date: 2026-08-07
Owners: architecture coordinator
Affected tasks: architecture-external-contract-fidelity, adapter-ai-sdk-native-contract-correction, specification-exact-operation-contracts, runtime-operation-contract-correction, runtime-temporal-reference, adapters-protocol-qualification, adapter-langgraph-runtime, adapter-pydantic-ai-runtime, adapter-strands-runtime, runtime-adapter-substitution, specification-semantic-path-characterization, specification-semantic-reconciliation, adapter-pydantic-ai-semantic-projection, specification-cross-adapter-conformance, integrations-connector-characterization, integrations-connector-contracts, adapter-coding-agent-integration, adapter-strands-runtime-release
Supersedes: ADR-007's known-semantic-loss support clause, ADR-009's lossy-conversion support clauses, ADR-012's ConversionFidelity support-level vocabulary, ADR-013's mapping/loss-report and loss-model clauses, ADR-014's support/loss-report clause, ADR-015's A2A mapping-with-loss framing, and ADR-016's information-loss-reporting ownership clause

## Context

The v2 architecture correctly kept provider, framework, protocol and
specification-native state outside the portable kernel. It nevertheless allowed
an adapter to claim support for a narrowed projection when accompanied by a
fidelity or information-loss report.

That posture is unnecessary for a pre-user package and weakens recognised
external contracts. A2A, MCP, provider APIs, runtime frameworks and
specification systems already define their operations, identity, state, events,
errors and extension rules. The adapter boundary should preserve those
contracts rather than inventing a reduced substitute and accounting for what
was discarded.

## Decision

### Contract authority

- Every external integration names its recognised specification or reference
  implementation, exact version and immutable qualification fixture.
- A supported operation preserves the semantics required by that authority.
  Unsupported operations are declared unsupported and cannot be reclassified
  as supported by attaching a loss, fidelity or compatibility report.
- An operation is `not-applicable` only when the recognised source contract
  does not define that operation or semantic dimension. It is not a substitute
  for missing implementation, failed qualification or version drift.
- Version drift is unsupported until fresh qualification proves the new exact
  contract.

### Native and portable surfaces

- Native identity, state, events, errors and extension data remain owned by the
  integration and are exposed through its explicit native surface.
- A native value maps to a portable kernel contract only where semantic
  identity is proven. Otherwise the adapter retains the native contract or
  rejects the portable operation.
- Portable envelopes and opaque references may identify native resources, but
  they do not pretend to reproduce the resource's semantics.
- Security boundaries remain authoritative. Credential removal, redaction and
  data-classification enforcement are explicit boundary requirements, not
  semantic-loss exceptions.

### Protocols, runtimes and providers

- A2A remains an A2A contract at its public adapter boundary. Generic
  `AgentRunner` use is supported only for operations whose A2A identity, task,
  delegation, event and failure semantics are preserved exactly.
- MCP tools and resources retain their MCP schemas, lifecycle and error
  behaviour while controlled effects pass through kernel policy and receipt
  enforcement.
- Runtime adapters retain native graphs, sessions, checkpoints, controls and
  events. Runtime substitution is claimed only for the explicitly portable
  operation being exercised, never for native state interchangeability.
- Model and provider adapters preserve validated provider-native metadata and
  response semantics under their namespaced, redacted native contract. A
  portable model result does not erase or reinterpret supported provider data.

### Specification integrations

- Import retains an immutable native source snapshot and exact source identity.
- A portable projection includes only semantics with a proven exact mapping.
  Native constructs without such a mapping remain available through the native
  source contract and are unsupported by that portable projection.
- Export or round-trip support is claimed only where the complete supported
  source contract is reproduced. Partial derivation is named as a distinct
  operation, not a lossy conversion.

## Consequences

Adapter qualification uses `supported`, `unsupported` and `not-applicable`
operation matrices rather than lossy or projected support levels. Existing
conversion-fidelity and loss fields are audited and removed or replaced with
exact operation identity, native preservation and explicit disposition
diagnostics.

This does not require the portable kernel to absorb every external concept.
It requires honest boundaries: the native integration owns what is native, and
the portable kernel claims only what it can represent exactly.

## Rejected alternatives

- Keep lossy support and improve the quality of loss reports.
- Add every external protocol or framework concept to the portable kernel.
- Hide unsupported native behaviour in untyped metadata.
- Treat a shared name as proof of semantic equivalence.

## Naming and public API impact

`loss`, `lossy` and `fidelity` cease to be support levels. Public operation
matrices use exact operation identifiers and the closed `supported`,
`unsupported` or `not-applicable` dispositions. Native extension fronts remain
explicitly integration-owned.

## Serialization and compatibility impact

Portable wire contracts continue to contain strict, validated data and opaque
references. Native serialized data remains namespaced and version-bound. The
package is pre-user, so inferior conversion and metadata contracts are replaced
directly without compatibility shims.

## Verification implications

- Qualification pins the authoritative specification or reference
  implementation and exact version.
- Every supported operation has executable success, failure, cancellation,
  identity, state and extension fixtures required by its source contract.
- Unsupported operations fail explicitly and cannot produce a narrowed success
  value.
- Every `not-applicable` disposition identifies the exact source contract and
  version evidence proving that the operation or semantic dimension is absent;
  an unimplemented applicable operation must verify as `unsupported` instead.
- Provider-native metadata fixtures prove preservation after required redaction.
- A2A and MCP fixtures use the recognised protocol SDKs and conformance assets.
- Specification round trips are claimed only when exact fixtures reproduce the
  complete supported source contract.

## Follow-up tasks

- `architecture-external-contract-fidelity` inventories and replaces current
  support-by-loss authority and freezes the replacement contracts.
- `adapter-ai-sdk-native-contract-correction` repairs the published provider
  adapter and its explicit native surface.
- `specification-exact-operation-contracts` replaces conversion fidelity and
  corrects the implemented specification adapters.
- `runtime-operation-contract-correction` replaces projected compatibility in
  the current runtime proof.
- Runtime, protocol, provider and specification adapter tasks depend on this
  correction and adopt exact operation matrices after acceptance.
