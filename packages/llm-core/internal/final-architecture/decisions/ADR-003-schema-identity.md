# ADR-003 — Schema Authority, Identity and Native Extensions

Status: proposed
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-100, P0-110, P0-120, P0-130
Supersedes: none

## Context

Cross-language runtimes require JSON-compatible wire contracts, stable
identities, schema versions and lossless native payload preservation.

## Proposed decision

- Use constrained TypeScript source types with checked JSON Schema projections.
- Define opaque/branded IDs for invocation, run, step, tool call, conversation,
  provider session, durable job, principal, tenant and correlation.
- Define `ContractVersion`, `SchemaRef` and explicit compatibility metadata.
- Reserve a namespaced `extensions` record with unknown-field passthrough.
- Mark live/non-serializable contracts explicitly and exclude them from schema
  generation.
- Keep secrets as opaque references, never event or prompt payloads.
- Redact sensitive arguments, results, credentials, and identity data before
  event emission. Events carry explicit redaction markers or evidence
  references rather than recoverable secret values.

## Open points to resolve

- Schema generator and supported TypeScript subset.
- Exact ID wire representation.
- Mandatory content variants and binary/media references.
- Exact evidence-reference wire shape.

## Verification implications

Contract fixtures must round-trip JSON and preserve unknown namespaced
extensions.
