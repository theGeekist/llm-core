---
id: core-tool-control-events
title: Implement tool control and execution-event kernel
stage: core
status: done
priority: critical
depends_on:
  - core-contracts
decision_dependencies:
  - ADR-003
  - ADR-005
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/tests/tooling/**
  - packages/llm-core/tests/control/**
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/docs/final-architecture/tasks/core-tool-control-events.md
required_reading:
  - path: docs/orchestration/controlled-tool-execution.md
    reason: "Preserve policy, approval, receipt and evidence ordering for meaningful effects."
  - path: packages/llm-core/docs/v1-workflow-notes.md
    reason: "Identify the retired tool and workflow coupling corrected by v2."
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - docs/orchestration/controlled-tool-execution.md
  - packages/llm-core/docs/v1-workflow-notes.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
review_owner: coordinator
updated_at: 2026-07-29
---

# core-tool-control-events — Implement Tool Control and Execution-Event Kernel

## Objective

Prove one complete tool path:
policy → approval when required → concurrency/sandbox decision → execution →
receipt → canonical event.

## In scope

Tool specs/calls/results, effect classes, action digest, policy and approval
records, receipts, `ExecutionEvent`, `EventSink`, cancellation and exclusive
execution.

## Out of scope

HITL recipe migration, UI projections, provider-specific tool adapters and root
exports.

## Acceptance criteria

- Changed arguments invalidate prior approval.
- Exclusive tools do not use unconditional parallel execution.
- Idempotency and cancellation produce explicit receipts.
- Policy, approval and execution share run/tool-call identities.
- Sensitive/native data follows ADR-003/005 rules.

## Verification

```sh
bun test packages/llm-core/tests/tooling packages/llm-core/tests/control packages/llm-core/tests/evidence packages/llm-core/tests/application/tool-execution
bun run typecheck:packages
```

## Work log

- 2026-07-29T16:49:00+08:00 — Claimed by `codex-root` after core-contracts completed
  and core-model-runtime was assigned to Claude Code in a disjoint worktree.
- 2026-07-29T16:52:00+08:00 — Began implementation in the dedicated worktree.
  Child work is partitioned into disjoint tooling, control, and evidence/event
  slices; `codex-root` owns the application orchestrator and final integration.
- 2026-07-29 — Implemented and reviewed the complete tool path. Two read-only
  integration passes found lifecycle, replay, event-delivery, approval-window,
  lease-validation, and cancellation races; all acceptance-blocking findings
  were resolved before final verification.
- 2026-07-29 — Moved to `complete` after the required focused suite,
  package typecheck/schema check, lint, formatting, and diff checks passed.

## Handoff

Status: complete; ready for integration from `task/core-tool-control-events-codex`.

### Delivered

- Strict registered-schema validation before action binding, policy, receipt
  reservation, or execution.
- JCS-canonical action documents and tenant/security-domain HMAC-SHA-256
  `ActionDigest` values through an injected port.
- Explicit tool spec/binding/call/result separation, effect classes,
  execution semantics, and stable tool identity/version.
- Fail-closed policy and authenticated approval bound to the same digest,
  run, and tool-call identities. Approval windows and approver constraints are
  durably recorded before external approval and rechecked before execution.
- Storage-neutral authoritative receipt journaling with atomic idempotency
  reservation, CAS transitions, recovery-safe replay, and full effect
  disposition.
- Shared/exclusive concurrency leases with interruptible queued cancellation
  and fail-closed lease identity validation.
- Durable before-start and post-start cancellation facts without treating a
  request as proof that an effect stopped.
- Canonical redacted execution events projected independently of the receipt
  ledger; a failed or hanging sink cannot gate or replay an effect.

### Deferred boundary

Durable ownership fencing, staleness policy, and active reconciliation for a
receipt left in `started` belong to the core-agent-runner runner/recovery slice. core-tool-control-events
already refuses to re-execute `started` or `indeterminate` receipts blindly.

### Verification

- Focused tooling/control/evidence/application suite: 56 pass, 0 fail.
- `bun run typecheck:packages`: pass, including contract-schema freshness.
- Focused ESLint, Prettier check, and `git diff --check`: pass.
