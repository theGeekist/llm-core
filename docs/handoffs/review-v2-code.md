> **Credit & provenance:** Replaces the task-named and split review handoffs.
> It carries forward Architecture v2 review evidence on curated public surfaces,
> private authority, `MaybePromise`, controlled effects, evidence, state
> lifetimes, adapters, credentials, and conformance. Prepared by `codex-root`
> on 2026-08-01.

# Review Architecture v2 code

## Role

Use this durable reviewer brief for any Architecture v2 task. It is not tied to
a task name: the user supplies the task and its uncommitted submission, then
relays the result to the implementer. Read [the shared plan](./plan-v2-arch.md),
the exact task brief, its ADRs, and the actual task-scoped diff against the
task's recorded `base_sha` before accepting a completion summary. The reviewer
does not claim, update, or complete task state.

## Architecture and public-boundary checks

- Capability rules belong in `src/features`; cross-feature sequencing belongs
  in `src/application`; framework/provider/protocol semantics belong in a
  qualified `src/adapters` boundary. Reject deep feature imports.
- Enforce curated root and explicit extension fronts. Reject wildcard/barrel
  leakage, framework types crossing portable contracts, undocumented package
  entrypoints, and qualification work that edits publication-owned files.
- Portable data is not execution authority. Graph/registration/authority
  internals stay private; controlled Agent/workflow/tool gateways must use
  current private validation at preparation, execution, and resume.
- Adapter claims name exact source/version, operation, support, loss, fixture,
  and ownership/write-back posture. Unknown semantics are namespaced portable
  data or explicit diagnostics—never silent flattening or guessed support.

## Runtime and behavioral checks

- Preserve `MaybePromise`, stream terminal/error behavior, pause/resume,
  cancellation, rollback, and external adapter contracts. Reject a
  simplification that changes lifecycle semantics or forces always-async flow.
- Controlled effects retain action digest, policy, approval, receipt,
  idempotency, and cancellation checks. Recovery never silently repeats or
  declares an ambiguous external effect complete.
- Canonical evidence is not a trace; observed usage, estimates, reconciled
  costs, and budget decisions are different facts. Trace exporters are redacted
  failure-isolated projections; missing pricing/data has explicit posture.
- Credentials remain host/platform owned and serialized values contain opaque
  references/safe metadata only. Authorization never bypasses effect control.
- Runtime/protocol adapters pin versions, prove conformance, declare loss, and
  fail unsupported checkpoint/sandbox/delegation behavior explicitly.

## Evidence and report format

Review the uncommitted task-scoped diff only, using the task's `base_sha` and
`write_scope` to distinguish it from concurrent work. Inspect both unstaged
and staged changes. Read source and failure-path tests, run the task's focused
tests plus nearby architecture/conformance/control/evidence suites, then the
task-required type/lint/package gates. Finish with a whitespace check over the
submitted task scope and keep concurrent work out of scope.

Put each real actionable `P0`–`P2` finding in its own copyable `md` fenced
block with severity, file/line, broken invariant, reproduction, impact, and
required correction. Keep approval/no-finding status and verification evidence
in ordinary Markdown. A passing reviewer result is relayed by the user; the
primary implementer marks its task `done`.
