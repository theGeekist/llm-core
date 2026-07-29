# ADR-001 — Contract Authority and Source Topology

Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-100, P0-110, P0-120, P0-130, P0-140
Supersedes: none

## Context

Portable domain contracts currently live under `src/adapters/types`, while
workflow, recipes and interaction import them. This makes adapters appear to
own the kernel vocabulary and permits cross-layer cycles.

## Decision

- Keep one npm package initially.
- `src/contracts` is the sole authority for dependency-light portable ABI
  contracts. It may import only approved pure utilities from `src/shared`.
- Place capability contracts and behavior under `src/features/<capability>`.
  Every feature exposes one `public.ts`; cross-feature deep imports are
  prohibited.
- `src/application` is the sole authority for coordination across capabilities.
  Existing workflow, recipe, agent-loop, tool-execution, and interaction
  sequencing migrates there even when public subpath names remain stable.
- Provider, framework, and runtime adapters translate native ecosystems into
  contracts and feature ports. Native values never enter portable fields.
- UI adapters may depend on the public interaction application contract and
  only project canonical application events into UI protocols.
- `src/composition` owns concrete binding assembly, provider factories,
  secrets/environment resolution, defaults, and delivery-time selection.
- `src/services` is reserved for optional host-facing implementations of
  stable ports. Do not create it in P0 without a concrete service.
- `src/shared` contains domain-neutral pure utilities and depends on no higher
  layer.
- Allowed direction is `shared <- contracts <- feature public fronts <-
  application <- composition/delivery`. Adapters depend inward on contracts
  and feature fronts and are injected through composition.
- Initial public fronts are `/contracts`, `/model`, `/tools`, `/control`,
  `/evidence`, `/state`, `/agent`, `/workflow`, `/interaction`, and
  adapter-specific subpaths. The root remains curated.
- Add mechanical deep-import and dependency-direction checks before migration.

## Consequences

Existing paths move substantially, but ownership and extraction boundaries
become explicit. Package extraction remains earned, not speculative.

Physical legacy directories may remain during vertical migration, but no new
portable contract is added under `adapters/types`. Convergence moves or deletes
all legacy authorities.

## Rejected alternatives

- Keep normalized types adapter-owned.
- Create one npm package per proposed capability immediately.
- Allow workflow, recipes and interaction to coordinate each other freely.

## Follow-up tasks

P0-100 establishes the contract front; P0-150 owns final exports and deletion.
