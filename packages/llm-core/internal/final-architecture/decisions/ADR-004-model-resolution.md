# ADR-004 — Model, Provider, Profile and Credential Boundary

Status: proposed
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-120, P0-160
Supersedes: none

## Context

`model-selection.ts` hard-codes ecosystems, providers, model lists and
environment-token lookup. A model name is not a capability contract.

## Proposed decision

- Separate `ModelRef`, `ProviderRef`, deployment configuration and
  `ModelProfile`.
- Require versioned conformance evidence for capability claims.
- Resolve models through caller/composition-provided registries.
- Keep provider factories and credential resolution inside adapters/composition.
- Never read ambient provider credentials in the portable model feature.
- Preserve provider-native data under extensions.

## Consequences

The current selector is deleted. Adapters own provider edge cases; core owns
requirements, resolution semantics and conformance claims.
