# ADR-001 — Contract Authority and Source Topology

Status: proposed
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-100, P0-110, P0-120, P0-130, P0-140
Supersedes: none

## Context

Portable domain contracts currently live under `src/adapters/types`, while
workflow, recipes and interaction import them. This makes adapters appear to
own the kernel vocabulary and permits cross-layer cycles.

## Proposed decision

- Keep one npm package initially.
- Move portable ABI contracts to dependency-light `src/contracts`.
- Place capability behavior under `src/features/<capability>` with `public.ts`.
- Place all cross-capability coordination under `src/application`.
- Keep provider/framework/UI/runtime translation under `src/adapters`.
- Expose explicit subpaths; keep root exports curated.
- Add mechanical deep-import and dependency-direction checks before migration.

## Consequences

Existing paths move substantially, but ownership and extraction boundaries
become explicit. Package extraction remains earned, not speculative.

## Rejected alternatives

- Keep normalized types adapter-owned.
- Create one npm package per proposed capability immediately.
- Allow workflow, recipes and interaction to coordinate each other freely.

## Follow-up tasks

P0-100 establishes the contract front; P0-150 owns final exports and deletion.
