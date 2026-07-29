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
