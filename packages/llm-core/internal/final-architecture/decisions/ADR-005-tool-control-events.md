# ADR-005 — Tool Effects, Policy, Approval and Events

Status: proposed
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-110, P0-130, P0-140
Supersedes: none

## Context

The current tool path executes calls through `maybeAll` without a common effect,
authorization, approval, concurrency, idempotency or receipt boundary.

## Proposed decision

- Define one canonical action digest over tool identity, version and arguments.
- Separate `ToolSpec`, executable binding, call, result and execution receipt.
- Classify read-only, reversible, external-write, destructive and privileged
  effects.
- Separate policy evaluation, authenticated approval and execution.
- Route every tool call through one application orchestrator.
- Fail closed for every non-read-only effect when policy, required approval,
  action integrity, or receipt infrastructure cannot establish a safe path.
- Define explicit concurrency/exclusive execution and cancellation semantics.
- Emit execution intents and terminal receipts through a storage-neutral port.
  Storage engines, databases, queues, and evidence stores implement that port;
  the control feature does not select persistence technology.
- Emit canonical `ExecutionEvent` facts; map them to traces and UI events.
- Redact sensitive arguments and results before facts reach an `EventSink`;
  use evidence references when authorized detail must remain recoverable.

## Open points to resolve

- Canonical digest algorithm and schema normalization.
- Canonical receipt-port lifecycle and failure recovery after an effect starts.
