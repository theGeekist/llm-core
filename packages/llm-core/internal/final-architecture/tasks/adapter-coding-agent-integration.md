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
  - architecture-runtime-ownership-correction
  - capabilities-runtime-conformance
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-016
conflicts_with: []
write_scope:
  - apps/coding-agent-qualification/**
  - packages/llm-core/src/adapters/coding-agent/**
  - packages/llm-core/tests/adapters/coding-agent/**
  - docs/adapters/coding-agent.md
  - packages/llm-core/internal/final-architecture/tasks/adapter-coding-agent-integration.md
review_owner: human
updated_at: 2026-08-04
---

# adapter-coding-agent-integration — Characterize and qualify a coding-agent integration

## Objective

Select and qualify one real coding-agent boundary—such as Codex, Claude Agent
SDK or OpenHands—for repository work, workspace controls, events, artifacts and
evidence without rebuilding its loop in `llm-core`.

## Acceptance criteria

- The selection records operating boundary, permissions, workspace ownership,
  cancellation, artifacts and native session semantics.
- One governed repository-change fixture produces normalized evidence.
- Native trajectory and workspace state remain owned by the coding agent.
- Publication, if any, is a separate exact-version support decision.

## Verification

Defined after characterization selects the concrete integration.
