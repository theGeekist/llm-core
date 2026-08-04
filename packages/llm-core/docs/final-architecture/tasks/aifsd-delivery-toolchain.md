---
architecture_version: 2
id: aifsd-delivery-toolchain
title: Derive the AIFSD delivery SDK or CLI
stage: applications
status: cancelled
forward_to:
  - aifsd/build-runtime-vertical-slice
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
  - aifsd-delivery-characterization
decision_dependencies:
  - ADR-015
  - ADR-016
conflicts_with: []
write_scope:
  - apps/aifsd/**
  - packages/aifsd-delivery/**
  - docs/applications/aifsd-delivery.md
  - packages/llm-core/docs/final-architecture/tasks/aifsd-delivery-toolchain.md
review_owner: human
updated_at: 2026-08-04
---

# aifsd-delivery-toolchain — Derive the AIFSD delivery SDK or CLI

## Objective

Derive a cohesive AIFSD SDK, CLI or application from the completed delivery
characterization as a separate artifact above `llm-core`. Runtime-adapter
substitution is an independent product-runtime qualification programme, not a
prerequisite for this delivery artifact.

## Acceptance criteria

- Artifact shape is chosen from measured consumers and release ownership.
- The toolchain imports supported `llm-core` fronts and explicit integrations;
  it does not reach into kernel internals.
- Delivery orchestration stays outside `llm-core`.
- Desktop or mobile clients require new evidence and separate tasks.

## Verification

Defined after characterization determines the artifact and consumer matrix.

## Work log

- 2026-08-04 — Cancelled before implementation and forwarded toward a planned
  dedicated AIFSD package for SDK, CLI, template, client, and delivery
  orchestration ownership. No committed replacement authority is claimed.

## Handoff

Continue product derivation only after the planned AIFSD task authority is
committed.
