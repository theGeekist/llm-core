# ADR-005 — Tool Effects, Policy, Approval and Events

Architecture version: v2
Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: core-tool-control-events, core-state-interventions, core-agent-runner
Supersedes: none

## Context

The current tool path executes calls through `maybeAll` without a common effect,
authorization, approval, concurrency, idempotency or receipt boundary.

## Decision

- Approval and policy bind to `ActionDigest`, never display text, a native
  payload, or a redacted argument view.
- The canonical action document contains contract profile, stable tool ID and
  immutable version, input-schema digest, effect class/targets,
  tenant/principal/delegation, execution-semantic qualifiers, and the exact
  normalized arguments passed to execution.
- Run, step, call, trace, approval, idempotency, attempt, timestamp, label, and
  observability fields are excluded from the action document.
- Arguments are strict JSON validated without coercion, inserted defaults, or
  unknown-field stripping. Reject non-finite/unsafe numbers, cycles, and
  non-JSON values. Canonicalize with RFC 8785 JCS.
- Canonical schemas are independently JCS-canonicalized and SHA-256 digested at
  registration. Any schema-document change changes the action binding.
- An injected `ActionDigestPort` produces and verifies tenant/security-domain
  HMAC-SHA-256 digests with a rotation-capable opaque `keyRef`. The digest value
  is unpadded base64url.
- Separate `ToolSpec`, executable binding, call, result and execution receipt.
- Classify read-only, reversible, external-write, destructive and privileged
  effects.
- Separate policy evaluation, authenticated approval and execution.
- Route every tool call through one application orchestrator.
- Unknown execution-affecting extensions on non-read-only calls fail closed.
- Define explicit concurrency/exclusive execution and cancellation semantics.
- A storage-neutral `ToolReceiptJournal` is authoritative; `EventSink` is not a
  receipt store. The journal provides atomic create-if-absent reservation,
  uniqueness, optimistic revision/CAS append, durable acknowledgement, load,
  and idempotency lookup without prescribing a storage engine.
- Every non-read-only effect requires an idempotency key, durable journal,
  recorded digest/policy/approval references, and a durable `started`
  transition before invocation. Failure to record any prerequisite fails
  closed before execution.
- Emit canonical `ExecutionEvent` facts; map them to traces and UI events.
- Redact sensitive arguments and results before facts reach an `EventSink`;
  receipts/events retain the digest, safe projection, and authorized evidence
  references rather than raw values.

## Receipt lifecycle and recovery

The append-derived lifecycle distinguishes:

```text
reserved -> awaiting_policy -> awaiting_approval -> ready -> started
reserved/awaiting/ready -> denied | expired | cancelled_before_start
started -> succeeded | failed_after_start | indeterminate
indeterminate -> succeeded | failed_after_start | reconciliation_required
failed_after_start/succeeded -> compensation_required -> compensating
compensating -> compensated | compensation_failed
```

Effect disposition is separately `not-started`, `none`, `applied`, `partial`,
`unknown`, or `compensated`.

- A throw after `started` does not prove absence of an effect. Without proof,
  the receipt becomes `indeterminate`.
- Cancellation after `started` is a request until the executor/provider
  acknowledges a known disposition.
- Reservation uniqueness is tenant + tool ID + tool version + idempotency key.
  Same key/digest returns the existing receipt; a different digest conflicts.
- `started` or `indeterminate` is reconciled and never blindly re-executed.
- Automatic retry after `started` requires adapter conformance evidence for
  provider idempotency or reconciliation that prevents duplication.
- If final receipt persistence fails after an effect, recovery begins from the
  durable `started` record. Unprovable disposition remains indeterminate.
- Journal transitions precede event projection. Event failure cannot erase,
  downgrade, or cause replay of an effect.

## Rejected alternatives

- `JSON.stringify` or a redacted view as canonical input.
- Plain SHA-256 for secret-bearing low-entropy action arguments.
- Coercion, implicit defaults, or separate approved/executed argument values.
- Raw arguments/results in receipts, events, or approval displays.
- Best-effort event emission as the receipt ledger.
- Mutable receipt state without transition history.
- Retrying a thrown meaningful effect without disposition proof.
- Treating reversible effects or cancellation requests as intrinsically safe.
- Requiring SQL, KV, Temporal, or any particular storage backend.
