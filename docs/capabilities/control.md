# Control

Control contracts make authority decisions explicit. Policy evaluation,
approval authentication, cancellation, and concurrency are separate ports
because each answers a different question.

Intervention requests and decisions belong to the
[state capability](/capabilities/state). Durable intervention sequencing belongs
to [workflow orchestration](/orchestration/workflows).

<<< @/snippets/v2/control-policy.ts

`authorizePolicyDecision` verifies that the returned policy decision is bound
to the expected run, tool call, and action digest. Missing, malformed, or
mismatched decisions are denied.

## Meaningful effects fail closed

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant R as Receipt journal
  participant P as Policy port
  participant A as Approval port
  participant G as Concurrency gate
  participant T as Tool binding

  O->>R: Reserve idempotency key
  R-->>O: Authoritative reservation
  O->>P: Evaluate exact action digest
  P-->>O: Allow, deny, or require approval
  opt Approval required
    O->>A: Authenticate approval
    A-->>O: Verified approval or denial
  end
  O->>G: Acquire lease
  G-->>O: Lease
  O->>R: Append started
  O->>T: Execute once
  T-->>O: Result or failure
  O->>R: Append final disposition
  O->>G: Release lease
```

The receipt reservation and concurrency lease solve different problems. The
receipt journal establishes durable effect identity and recovery. The gate
limits overlapping live execution. An `EventSink` emits a best-effort redacted
projection but replaces neither mechanism.

Retry after an effect starts requires verified idempotency or reconciliation.
A caller-provided label does not establish either guarantee.
