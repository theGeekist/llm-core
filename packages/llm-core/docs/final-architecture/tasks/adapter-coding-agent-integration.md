---
architecture_version: 2
id: adapter-coding-agent-integration
title: Characterize and qualify a coding-agent integration
stage: adapters
status: proposed
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-external-contract-fidelity
  - architecture-runtime-ownership-correction
  - capabilities-runtime-conformance
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - apps/coding-agent-qualification/**
  - packages/llm-core/src/adapters/coding-agent/**
  - packages/llm-core/tests/adapters/coding-agent/**
  - docs/adapters/coding-agent.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-coding-agent-integration.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/INTEGRATIONS.md
    reason: "Preserve coding-agent ownership, permissions and evidence boundaries in product composition."
  - path: context/aifsd-research/profiles/claude-agent-sdk.md
    reason: "Use one researched coding-agent boundary as selection evidence."
  - path: context/aifsd-research/profiles/openhands-sdk.md
    reason: "Compare an unlike coding-agent boundary before selecting the qualified target."
read_scope:
  - packages/aifsd/docs/final-architecture/INTEGRATIONS.md
  - context/aifsd-research/profiles/claude-agent-sdk.md
  - context/aifsd-research/profiles/openhands-sdk.md
review_owner: human
updated_at: 2026-08-04
---

# adapter-coding-agent-integration — Characterize and qualify a coding-agent integration

## Objective

Select and qualify one real coding-agent boundary—such as Codex, Claude Agent
SDK or OpenHands—for repository work, workspace controls, events, artifacts and
evidence without rebuilding its loop in `llm-core`.

## In scope

- Compare candidate coding-agent boundaries and select one exact version.
- Implement only the portable adapter projection required by the governed
  repository-change fixture.
- Characterize permissions, workspace ownership, cancellation, artifacts,
  sessions and supported or unsupported evidence operations.

## Out of scope

- Implementing a coding-agent loop or workspace engine in `llm-core`.
- Publishing the adapter or promising support for unqualified versions.
- Generalizing behavior not exercised by the selected fixture.

## Acceptance criteria

- The selection records operating boundary, permissions, workspace ownership,
  cancellation, artifacts and native session semantics.
- One governed repository-change fixture produces normalized evidence.
- Native trajectory and workspace state remain owned by the coding agent.
- Publication, if any, is a separate exact-version support decision.

## Verification

```sh
bun test apps/coding-agent-qualification packages/llm-core/tests/adapters/coding-agent
bun run docs:check
bun run check:sloc
```

The claimed task must pin the selected upstream version and replace these
commands only if its documented operating boundary requires an equivalent
isolated invocation.

## Work log

Not started; selection evidence and claim metadata are added on assignment.

## Handoff

Pending execution. Record the selected version and boundary, changed files,
fixture evidence, exact operation matrix, command results and publication
recommendation.
