---
id: adapter-antigravity-cli-hooks-runtime
title: Qualify the Antigravity CLI and hooks conversation adapter
stage: adapters
status: review
priority: critical
forward_to: []
depends_on:
  - native-agent-conversation-runtime-contract
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-016
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/tests/adapters/antigravity-cli-hooks/**
  - docs/adapters/antigravity-cli-hooks.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-cli-hooks-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Reconstruct the successful hook-backed execution-boundary route and the concurrent-headless cancellation failure.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Keep the proven CLI hook profile separate from the Desktop Sidecar profile.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Prevent the hook inbox from claiming durable delivery, runtime wake or semantic processing without separate receipts.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/tests/adapters/antigravity-cli-hooks/**
  - docs/adapters/antigravity-cli-hooks.md
review_owner: coordinator
updated_at: 2026-09-05
---

# adapter-antigravity-cli-hooks-runtime - Qualify the Antigravity CLI and hooks conversation adapter

## Objective

Implement and qualify an exact-version Antigravity adapter that uses headless
CLI conversation lifecycle for new and idle runs and hook-backed inbox delivery
for non-cancelling active input.

## Why this exists

The Simple Chat spike showed that Antigravity supports active conversation, but
at provider execution boundaries rather than through a native live-message API.
A concurrent headless continuation cancelled or displaced active work, while a
hook-injected `userMessage` let the current command finish and continued the
same conversation. That distinction is a first-class contract fact.

The proposed private AIFSD decision
`ADR-012-native-agent-runtime-integration-composition.md` may later compose the
qualified adapter. It is provenance only until reachable.

## Inputs

- The completed native-agent conversation runtime contract and conformance
  fixtures.
- Exact Antigravity CLI, headless and hooks documentation for the selected
  release.
- Dated Simple Chat hook-backed ingress evidence.

## In scope

- `agy -p` projection to `conversation.start`.
- `agy -p --conversation <id>` projection to idle
  `conversation.continue` only.
- Stream JSON and hook lifecycle projected to `run.observe`.
- A correlated, host-owned hook inbox projected to `run.input.submit` with
  `execution-boundary` delivery.
- Hook output validation, continuation control and duplicate delivery fencing.
- Explicit cancellation projected only to `run.cancel`.
- Early Antigravity conversation identity projected as `ProviderSessionRef`.
- Exact-version CLI, hook, process, permission, native-contract and
  projection-observability qualification.

## Out of scope

- Concurrent headless continuation as active input.
- `/btw` as primary-run steering.
- Claiming stream JSON as an input protocol or hook acceptance as mid-command
  pre-emption.
- Treating a local inbox as a durable mailbox, scheduler or coordinator.
- Adapter publication, provider credentials or a default runner.

## Contract and naming constraints

- The hook inbox is host-owned and addressable by opaque portable correlation,
  but physical paths and native hook payloads remain adapter-owned.
- Input may be accepted while a command is active; `execution-boundary` means
  the agent receives it only at the next eligible hook boundary.
- Hook delivery must not set or imply cancellation.
- Provider acceptance, hook injection, agent observation and semantic processing
  require distinct evidence states.
- Configuration supplies executable location, hook registration, inbox store,
  time bounds and process policy at composition.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- A pinned Antigravity release passes the shared lifecycle suite with
  `execution-boundary` active input.
- The original active command completes normally when correlated input arrives,
  and the same run processes that input at a later eligible boundary.
- Concurrent headless continuation and `/btw` are executable negative fixtures,
  not undocumented fallbacks.
- Duplicate, stale, already-terminal, hook-error, watcher-loss, process-loss and
  terminal-race cases produce bounded portable outcomes.
- New and idle continuation retain provider-session identity while portable
  runs remain distinct.
- The adapter records when recipient observation or semantic processing cannot
  be proven.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/adapters/antigravity-cli-hooks
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Required evidence

- Exact Antigravity CLI version and official contract references.
- Operation and `execution-boundary` support report.
- Redacted hook, stream and process fixtures.
- Non-cancellation proof and concurrent-headless negative proof.
- Inbox delivery, hook injection and processing receipt limitations.
- Verification commands and results.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

- 2026-09-05: Host version probe `/Users/jasonnathan/.local/bin/agy --version` returned `1.1.27`.
- 2026-09-05: Live start probe returned conversation `eed87062-a0d6-403e-bcbe-30a172880417`, exact output `AGY_START_0905`, native `init`, nested `step_update`, and terminal `result.status: "SUCCESS"`.
- 2026-09-05: Live idle-continuation probe invoked `agy -p ... --conversation eed87062-a0d6-403e-bcbe-30a172880417 --output-format stream-json`, returned the same conversation ID, exact output `AGY_CONTINUE_0905`, and terminal `SUCCESS`.
- 2026-09-05: Applied the resulting operation matrix: `conversation.start`, `conversation.continue` and `run.observe` are supported. `run.input.submit` and `run.cancel` remain `unsupported/qualification-failed` pending exact live gates.
- 2026-09-05: The runner returns typed unsupported acknowledgements for input and cancellation without hook or process-cancellation side effects. Cancellation capability is `none`. Continued provider sessions resolve immediately while every later stream event remains subject to exact identity checking.
- 2026-09-05: Renamed the hook boundary value to
  `AntigravityHookInvocationProjection` to state that composition has already
  validated native input.
- 2026-09-05: Independent review replaced destructive inbox drain with
  prepare/commit/release claims. Boundary outputs are now discriminated,
  `Stop` prepares explicit refusals, failed stdout can release for redelivery,
  hostile non-portable content is rejected, and runner construction enforces
  the exact `agy 1.1.27` source contract.
- 2026-09-05: Final deterministic verification passed with 11 focused tests
  and 31 assertions, package and test TypeScript checks, scoped ESLint,
  Prettier and the public-boundary check. All Antigravity production and
  focused test modules are below 500 physical lines.
- 2026-09-05: Re-ran the active-input gate against installed CLI `1.1.27`
  with an eight-second `run_command` and a scoped `PostInvocation` hook.
  Conversation `9c9daf7f-d583-4108-b006-efeb48a8472d` reported the command
  active at step 2, then completed it in 8.048871 seconds and returned only
  `AGY_ORIGINAL_DONE_20260905C` with terminal `SUCCESS`. The CLI host log
  recorded `loaded 1 named hooks from 1 hooks.json file(s)`, but the handler
  never ran, no hook input was captured, and the queued nonce flag remained.
  The temporary shared `~/.gemini/config/hooks.json` was removed and its
  absence verified after the probe.
- 2026-09-05: Current `agy --help` exposes no active-run cancellation
  operation. The `remote-control stop` command controls the background daemon,
  not a conversation run.
- 2026-09-05: Independent final re-review found no remaining actionable
  issues. The four-adapter focused suite passes 50 tests with 133 assertions;
  package and test typechecks, Prettier, the public-boundary check, and
  `git diff --check` pass. Scoped ESLint exits successfully with two existing
  Claude runner complexity warnings.

## Blocker

- Exact live active-input and cancellation gates have not passed. The current
  active-input probe is a bounded negative because the loaded hook handler was
  not dispatched. Those operations cannot be advertised or composed as
  supported.

## Handoff

### Result

The exact `1.1.27` start, idle-continuation and observation route is implemented and qualified by current host evidence. Active input and cancellation fail closed as typed unsupported operations with no corresponding native side effects.
The implementation is review-clean, but the task remains at review because its
active-input and cancellation acceptance gates are unmet.

### Decisions applied

- ADR-006: Portable operation vocabulary and TaskGraph migration boundary.
- ADR-007: Exact-version conformance fixtures and runtime contract isolation.
- ADR-016: Integration-owned execution and application-composition boundaries.
- ADR-017: Evidence-bound supported and `unsupported/qualification-failed` dispositions.
- ADR-018: Provider-session continuity without inventing unqualified input or cancellation semantics.

### Files changed

- `packages/llm-core/src/adapters/antigravity-cli-hooks/profile.ts`
- `packages/llm-core/src/adapters/antigravity-cli-hooks/protocol.ts`
- `packages/llm-core/src/adapters/antigravity-cli-hooks/inbox.ts`
- `packages/llm-core/src/adapters/antigravity-cli-hooks/runner.ts`
- `packages/llm-core/src/adapters/antigravity-cli-hooks/public.ts`
- `packages/llm-core/tests/adapters/antigravity-cli-hooks/runner.test.ts`
- `docs/adapters/antigravity-cli-hooks.md`
- `packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-cli-hooks-runtime.md`

### Verification evidence

- Host version: `1.1.27`.
- Start: conversation `eed87062-a0d6-403e-bcbe-30a172880417`, `AGY_START_0905`, terminal `SUCCESS`.
- Idle continuation: same conversation ID, `AGY_CONTINUE_0905`, terminal `SUCCESS`.
- `bun test packages/llm-core/tests/adapters/antigravity-cli-hooks` (11 pass, 0 fail, 31 assertions).
- `./node_modules/.bin/tsc -p packages/llm-core/tsconfig.json --noEmit` (pass).
- `./node_modules/.bin/tsc -p packages/llm-core/tsconfig.test.json --noEmit` (pass).
- Scoped ESLint and Prettier checks (pass).
- `bun scripts/check-public-boundary.ts` (pass).

### Deviations

- The immutable task objective and acceptance criteria anticipated supported execution-boundary input and explicit cancellation. Current host evidence does not qualify either operation, so both remain `unsupported/qualification-failed`.

### Remaining risks

- Hook injection, recipient observation, semantic processing and process cancellation are unqualified. The hook inbox remains an internal post-validation projection helper and does not establish portable operation support.

### Recommended next task

Run exact live active-input and cancellation qualification before reconsidering either unsupported disposition, then proceed to `native-agent-cross-provider-conformance` only with the resulting evidence.
