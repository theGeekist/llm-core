# ADR-004 — Model, Provider, Profile and Credential Boundary

Architecture version: v2
Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-120, P0-160
Supersedes: none

## Context

`model-selection.ts` hard-codes ecosystems, providers, model lists and
environment-token lookup. A model name is not a capability contract.

## Decision

- `ModelRef` expresses logical selection intent, never a provider, deployment,
  credential, endpoint, or executable object.
- `ProviderRef` identifies an API/service dialect. `DeploymentRef` identifies a
  configured endpoint/deployment and contains no credential.
- `ModelProfile` is immutable and versioned for a specific
  provider/model/deployment. Claims cite conformance suite/version/date,
  adapter/provider versions, and provenance.
- Require versioned conformance evidence for capability claims.
- `ModelResolver.resolve` accepts selection intent, required capabilities,
  caller/composition-provided bindings, and policy constraints. It returns the
  selected binding, resolved references, profile/evidence, and diagnostics.
- Resolution is deterministic: exact binding precedes a policy alias; zero
  eligible bindings fails; an unresolved tie fails as ambiguous.
- No silent provider change, model/capability downgrade, or first-list fallback
  is permitted. An omitted model is valid only with an explicit named default,
  and the resolution records that choice.
- Core owns resolution semantics and result contracts. Composition owns
  bindings, defaults, aliases, routing policy, and factory choice.
- Keep provider factories and credential resolution inside adapters/composition.
- Never read ambient provider credentials in the portable model feature.
- Portable contracts carry only opaque `SecretRef` values. Credential values
  never enter requests, profiles, events, diagnostics, or extensions.
- Preserve redacted provider-native data only under namespaced extensions or
  provider metadata contracts.

In this ADR, provider means a model API/service dialect. Generic capability
implementation selection uses `CapabilityBinding`.

## Consequences

The current selector is deleted. Adapters own provider edge cases; core owns
requirements, resolution semantics and conformance claims.
