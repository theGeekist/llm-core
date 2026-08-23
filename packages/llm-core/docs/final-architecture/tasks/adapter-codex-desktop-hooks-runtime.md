---
architecture_version: 2
id: adapter-codex-desktop-hooks-runtime
title: Qualify the Codex Desktop hook bridge
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
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/tests/adapters/codex-desktop-hooks/**
  - docs/adapters/codex-desktop-hooks.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-codex-desktop-hooks-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Preserve the documented hook route, app-server visibility proof and private embedded-process limitation.
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Do not convert coordinator-owned app-server evidence into a claim about attachment to Desktop private stdio.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/tests/adapters/codex-desktop-hooks/**
  - docs/adapters/codex-desktop-hooks.md
review_owner: coordinator
updated_at: 2026-08-23
---

# adapter-codex-desktop-hooks-runtime - Qualify the Codex Desktop hook bridge

## Objective

Implement and qualify Codex lifecycle hooks as an execution-boundary bridge for
tasks hosted by Codex Desktop without depending on its private embedded
app-server transport.

## Why this exists

Codex hooks can check an external inbox during tool use and stopping, inject
model-visible context and create a Stop continuation prompt. This is useful for
an already-open Desktop-owned task, but it is not equivalent to app-server
`turn/steer` and it cannot start a later turn after the task is fully idle.

## In scope

- Project and user-scoped hook discovery for Desktop-hosted Codex tasks.
- `PreToolUse`, `PostToolUse`, `UserPromptSubmit` and `Stop` checkpoints.
- Correlated execution-boundary context delivery and Stop continuation.
- Explicit unsupported idle wake and private embedded-server attachment.
- Separation from the coordinator-owned app-server profile.

## Out of scope

- Attaching to undocumented Desktop stdio or private process handles.
- Claiming hook context as `native-live` steering.
- Treating Stop continuation as durable idle wake.
- Canonical mailbox, scheduler, retries or application routing.

## Acceptance criteria

- A pinned Codex Desktop release loads the qualified hook profile.
- Input submitted during active work is delivered at a documented safe boundary
  without cancellation or a second active writer.
- Stop continuation processes already-pending work without claiming later idle
  wake.
- Tests reject any dependency on the embedded app-server process, private stdio
  or shared-store implementation details.
- Support reports distinguish hook acceptance, model-visible context and
  causation-correlated processing.

## Verification

```sh
bun test packages/llm-core/tests/adapters/codex-desktop-hooks
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Work log

Pending.

## Handoff

Pending.
