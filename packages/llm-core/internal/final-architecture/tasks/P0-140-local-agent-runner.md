---
architecture_version: 2
id: P0-140
title: Implement AgentRunner and local runner
phase: P0.3
status: proposed
priority: P0
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - P0-110
  - P0-120
  - P0-130
decision_dependencies:
  - ADR-002
  - ADR-006
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/tests/agent/**
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/internal/final-architecture/tasks/P0-140-local-agent-runner.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-140 — Implement AgentRunner and Local Runner

## Objective

Introduce the neutral runner/run/control port and convert the current
recipe-backed implementation without exposing recipe internals.

## In scope

Agent spec, capabilities, start/events/result/cancel/resume contract, local
runner implementation, parent/child run identity and subagent recursion.

## Out of scope

Root exports, UI adapters, external runtime adapters and old-name deletion.

## Acceptance criteria

- Runner capabilities are inspectable before execution.
- Start, events, result, cancellation and optional resume test independently.
- Parent/child causal identity survives subagent execution.
- A fake remote runner passes the same contract suite.

## Verification

```sh
bun test packages/llm-core/tests/agent packages/llm-core/tests/application/agent
bun run typecheck:packages
```

## Work log

## Handoff
