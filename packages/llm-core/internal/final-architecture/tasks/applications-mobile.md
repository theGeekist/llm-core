---
architecture_version: 2
id: applications-mobile
title: Mobile companion application
stage: applications
status: proposed
priority: medium
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - applications-client-contract
decision_dependencies:
  - ADR-006
  - ADR-014
conflicts_with:
write_scope:
  - apps/mobile/**
  - docs/applications/mobile.md
  - packages/llm-core/internal/final-architecture/tasks/applications-mobile.md
read_scope:
  - packages/llm-client/**
  - packages/llm-core/package.json
review_owner: coordinator
updated_at: 2026-08-01
---

# applications-mobile — Mobile companion application

## Objective

Deliver a secure companion for conversations, approvals, run status,
notifications and cost visibility while remote infrastructure owns durable
execution.

## In scope

- Conversation/run views, approval decisions, cancellation requests,
  connection status, budgets, cost summaries and evaluation-backed routing
  explanations.
- System-browser OAuth with universal/app links, OS secure storage, encrypted
  offline cache, account/tenant switching and notification deep links.
- Cursor-based resynchronization after suspension, connectivity loss, token
  refresh or app upgrade.
- Supported iOS/Android lifecycle, migration and release-security posture.

## Out of scope

- Local durable workflows, unrestricted background execution, raw credential
  synchronization, provider-session portability or a mobile-hosted connector
  catalogue.

## Acceptance criteria

- Resume and notification flows reconcile against authoritative run state and
  cannot duplicate an approval or effect.
- Secure-store loss, revocation, deep-link replay, tenant switching and offline
  conflicts are tested.
- The UI distinguishes cancellation requested from acknowledged/terminal
  cancellation and estimates from reconciled provider cost.
- Framework choice is recorded with native security, background, update and
  minimum-OS implications before implementation is made ready.

## Verification

The implementation task records framework-specific unit, native integration,
deep-link, secure-storage, upgrade and supported-device smoke commands before
claiming review.

## Work log

Planned from ADR-014; not claimed.

## Handoff

Pending.
