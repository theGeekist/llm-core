# Bindings and composition

Capability bindings connect a neutral port to one configured implementation.
Registration verifies conformance evidence. Resolution is deterministic and
returns diagnostics instead of selecting the first candidate.

<<< @/snippets/v2/capability-bindings.ts

`verifyEvidence` is a trusted host-composition port, not a predicate over the
claim's self-reported `result`. It resolves the claim's `EvidenceRef` through
authorized storage, verifies the report's integrity and conformance-suite
provenance, then checks that the report is bound to the supplied `bindingId`,
port `kind`, and exact live `implementationToken`. It returns `true` only when
all of those checks succeed.

`descriptor.claims` must contain evidence-backed claims; the declarations above
assume composition loaded a validated descriptor and a host verifier.
Conditional claims also require an explicit `evaluateCondition` dependency.
Exact `bindingId` selection never falls through to a different implementation,
and an unqualified ambiguous request fails.

Keep three things separate:

- the descriptor and claims are portable configuration;
- the port is a live implementation value;
- invocation state records which registered binding was selected.

This is typed capability composition, not a string-keyed service locator.

## Register invocation state

`registerCapabilityInvocation` closes the bridge between a selected capability
and execution state. It validates and freezes `InvocationContext`, then accepts
only one typed lifetime: observe a `Snapshot`, continue a `LiveContinuation`,
resume a `RegisteredResumableCheckpoint`, continue a `ProviderSessionRef`, or
signal a `DurableExecutionHandle`. These states remain non-substitutable.

## Qualify retries

<<< @/snippets/v2/capability-invocation-retry.ts

`executeWithQualifiedRetry` performs exactly one attempt when no policy is
supplied. A multi-attempt policy is closed and bounded, needs a trusted failure
classifier, and must cite verified conformance evidence for one guarantee:

| Guarantee    | Required meaning                                                |
| ------------ | --------------------------------------------------------------- |
| `read-only`  | The exact operation is proven not to create a meaningful effect |
| `idempotent` | Repeating the operation preserves its declared effect           |
| `reconciled` | The implementation detects or reconciles duplicate effects      |

Meaningful effects cannot use the read-only guarantee. An operation not proven
read-only needs idempotent or reconciled evidence, especially after start.
Delayed retry also requires an explicit scheduler. Labels supplied by a caller
do not create any of these guarantees.
