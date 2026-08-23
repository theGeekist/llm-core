---
architecture_version: 2
id: adapter-antigravity-desktop-sidecar-runtime
title: Qualify the Antigravity Desktop Sidecar adapter
stage: adapters
status: proposed
priority: critical
replaced_by: []
forward_to: []
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
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
updated_at: 2026-08-23
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
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Work log

Pending.

## Handoff

Pending.
