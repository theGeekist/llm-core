# Bindings and composition

Capability bindings connect a neutral port to one configured implementation.
Registration verifies conformance evidence. Resolution is deterministic and
returns diagnostics instead of selecting the first candidate.

```ts
import {
  capabilityIdForPort,
  createCapabilityBindingCatalog,
  type CapabilityEvidenceVerifier,
  type Retriever,
} from "@geekist/llm-core/agent";
import type { CapabilityBinding } from "@geekist/llm-core/contracts";

declare const retriever: Retriever;
declare const descriptor: CapabilityBinding;
declare const verifyEvidence: CapabilityEvidenceVerifier;

const catalog = createCapabilityBindingCatalog({
  verifyEvidence,
});

catalog.register({
  kind: "retriever",
  descriptor,
  port: retriever,
});

const resolution = catalog.resolve({
  requirements: [
    {
      kind: "retriever",
      bindingId: descriptor.bindingId,
      capabilities: [
        {
          capabilityId: capabilityIdForPort("retriever"),
          versionRange: "^1.0.0",
        },
      ],
    },
  ],
});

if (resolution.kind === "unresolved") {
  throw new Error(JSON.stringify(resolution.diagnostics));
}

const selected = resolution.bindings[0];
```

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

This replaces legacy aggregate adapter objects and registry lookup. It is not
a string-keyed service locator.
