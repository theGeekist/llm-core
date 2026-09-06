---
id: adapter-antigravity-desktop-sidecar-runtime
title: Qualify the Antigravity Desktop Sidecar adapter
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
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/**
  - packages/llm-core/tests/adapters/antigravity-desktop-sidecar/**
  - docs/adapters/antigravity-desktop-sidecar.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-desktop-sidecar-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Qualify the official Sidecar API without inventing unobserved busy-turn timing.
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Compare Sidecar delivery with the proven CLI hook execution-boundary profile.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/**
  - packages/llm-core/tests/adapters/antigravity-desktop-sidecar/**
  - docs/adapters/antigravity-desktop-sidecar.md
review_owner: coordinator
updated_at: 2026-09-05
---

# adapter-antigravity-desktop-sidecar-runtime - Qualify the Antigravity Desktop Sidecar adapter

## Objective

Implement and qualify the supervised Antigravity Desktop Sidecar route using
`agentapi` conversation operations while preserving its timing and lifecycle
differences from the CLI hook profile.

## Why this exists

Antigravity documents `agentapi new-conversation` and `agentapi send-message`
for supervised Sidecars. The API is externally addressable, but its behaviour
when the target conversation is already busy remains unqualified.

## In scope

- Sidecar lifecycle, restart, configuration and permission characterization.
- `agentapi new-conversation` and `agentapi send-message` projection.
- Busy-turn timing probe and delivery-mode classification.
- Conversation identity, observation, error and recovery evidence.
- Explicit comparison with the CLI hook execution-boundary profile.

## Out of scope

- Inferring busy-turn behaviour from the command name or documentation silence.
- Reusing CLI hook receipts as Sidecar qualification.
- Canonical mailbox, scheduler, retries or application routing.
- General Desktop automation.

## Acceptance criteria

- A pinned Antigravity Desktop release passes supported shared lifecycle cases.
- Busy-turn delivery is classified from a causation-correlated executable probe.
- Sidecar restart, stale conversation, duplicate submission and process-loss
  cases produce bounded portable outcomes.
- Unsupported operations remain explicit and do not fall back silently to CLI
  hooks.
- Native Sidecar, conversation and event identities remain available in the
  support report where the provider exposes them.

## Verification

```sh
bun test packages/llm-core/tests/adapters/antigravity-desktop-sidecar
./node_modules/.bin/tsc -p packages/llm-core/tsconfig.json --noEmit
./node_modules/.bin/tsc -p packages/llm-core/tsconfig.test.json --noEmit
bun scripts/check-public-boundary.ts
bun scripts/check-sloc.ts
```

## Work log

- Characterized the official Antigravity Desktop Sidecar architecture and runtime boundary:
  - Pinned host desktop version `2.11.0` (minimum qualified `2.8.1`), Sidecar contract `1.1.27`.
  - Registered route profile `antigravity.desktop-sidecar.agentapi` with provider `provider.antigravity`.
  - Maintained strict 3-way identity separation: Desktop App host (`com.google.antigravity`), Sidecar process (`simple-chat-qualification`), and provider-injected `agentapi` CLI binary.
- Implemented bounded probe `runAntigravityDesktopSidecarProbe`:
  - Qualifies idle addressability only from a native idle-state inspection and
    accepted command receipt. Recipient observation remains unobservable and
    semantic processing remains untested.
  - Requires a native busy-state observation before recording a busy command
    receipt. Busy delivery timing remains unqualified; neither `native-live`
    nor `execution-boundary` is claimed.
- Implemented NativeAgentRunner in `packages/llm-core/src/adapters/antigravity-desktop-sidecar/runner.ts`:
  - `capabilities()` exposes exact operation dispositions: `conversation.start` (supported), `conversation.continue` (supported), `run.observe` (unsupported, `observability-insufficient`), `run.input.submit` (unsupported, `qualification-failed`), `run.cancel` (unsupported, `qualification-failed`).
  - Early session reflection via `providerSession()`.
  - Exact source-contract and three-way runtime identity validation at
    construction.
  - Local single-flight and native idle-state fencing before continuation.
  - Active input returns `unsupported` without a native call, matching the
    route profile.
  - Accepted conversation ingress retains the provider session and fails the
    portable run as `provider-unobservable`; no completion or output is
    fabricated.
  - `activeInputEvidence()` always returns typed `unavailable` with
    `reasonCode: "provider-unobservable"`.
  - Failure fencing: `AntigravitySidecarConfigurationError` (`disabledConfiguration`, `missingProjectId`), `AntigravitySidecarProcessError` (`absentProcess`, `processCrash`, `unavailableAgentApi`), `AntigravityStaleConversationError` (stale continuation rejection).
- Added focused tests covering profile, source-contract validation, lifecycle,
  idle continuation fencing, unsupported active input, closed error projection,
  bounded probes, and identity separation.
- Added public documentation `docs/adapters/antigravity-desktop-sidecar.md`.
- Maintained all files under the 500-line target.

## Blocker

The causation-correlated busy-turn acceptance gate is unmet. The current
executable probe can establish a native busy state and a provider command
receipt, but it cannot observe whether the recipient model incorporated the
message or when it did so. The Antigravity handoff supplied no recoverable
host command, conversation ID, nonce, native receipt, or immutable live probe
fixture. Busy-turn delivery therefore remains `unqualified`, and this task
must not advance to `done` until exact live evidence closes that gap.

## Handoff

- Antigravity's initial review handoff passed its focused suite but contained
  contract contradictions. Coordinator review rejected fabricated observation,
  active-input acceptance, timer-based completion, open native error prose, and
  unenforced version claims.
- The corrected focused suite passes 13 tests. The combined Codex and Sidecar
  suite passes 23 tests with 69 assertions.
- Package and test TypeScript checks, scoped ESLint, Prettier, and
  `git diff --check` pass.
- Independent final re-review found no remaining actionable issues.
- The task remains at review because the live causation-correlated busy-turn
  gate in the blocker above is unmet.
