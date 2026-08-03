# Plan

Stage 9 closes the adapter gap for true mix‑and‑match execution. The registry is a thin wrapper around
`makePipeline` (same core engine as `workflow/*`) and is responsible for construct resolution + execution
ordering, not a new orchestration layer.

## Status

Completed.

## Requirements

- End‑to‑end mix‑and‑match across providers (execution routing, not just shape conversion).
- Registry wraps `makePipeline` (helpers + lifecycles for execution, diagnostics, rollback).
- Adapter‑free primitives for core constructs (`builtin` providers).
- Construct + provider extension API (no core patching).
- Keep DX thin and type‑light; all modules/tests < 500 SLOC.

## Scope

- In: registry wrapper, primitives, construct extension, runtime routing.
- Out: new recipes beyond the core set.

## Files

- `src/adapters/registry.ts` (pipeline wrapper + registry)
- `src/adapters/primitives/*` (builtin providers)
- `src/adapters/index.ts` (exports + helper surface)
- `src/workflow/runtime.ts` (registry routing for run/resume)
- `docs/adapters-api.md`, `docs/workflow-api.md`, `docs/implementation-plan.md`

## Data model

### Registry (pipeline wrapper)

- Construct name: `"model" | "tools" | "retrieval" | "trace" | string`.
- Provider key: `"ai-sdk" | "langchain" | "llamaindex" | "builtin" | string`.
- Provider id: opaque string (e.g. `ai-sdk:openai:gpt-4.1-mini`, `builtin:model`).

Registry responsibilities:

- Store construct contracts + provider registrations.
- Build a pipeline via `makePipeline` and register helper kinds + lifecycle stages.
- Resolve providers by id or by construct + capability + default rules.
- Emit diagnostics when resolution fails or is ambiguous.

### Construct contracts

Constructs are resolved by name. Dependencies are declared at the recipe level
and surfaced as registry diagnostics (not enforced as pipeline dependencies).

### Adapter‑free primitives (builtin)

Minimal implementations for tests/demos:

- `builtin:model` (deterministic stub, returns `usage_unavailable` diagnostic).
- `builtin:tools` (sequential tool runner with error mapping).
- `builtin:retrieval` (in‑memory documents + simple scoring).
- `builtin:trace` (no‑op sink to keep traces present).

## Resolution rules (registry)

For each construct:

1. Run‑level provider override (`providers.model = "<providerId>"`).
2. Recipe default (if specified).
3. Registry default (highest priority provider).

If resolution fails:

- Mandatory construct → fail with diagnostics.
- Optional construct → continue with diagnostics.

Diagnostic codes:

- `construct_provider_missing`
- `construct_provider_not_found`
- `construct_provider_conflict`
- `construct_capability_missing`
- `construct_contract_conflict`

## Extension API (internal but documented)

- `registerConstruct(name, contract)`
- `registerProvider(constructName, providerKey, providerId, factory, options)`
  - options: `priority`, `capabilities`, `override`

## Runtime routing

- `run()` and `resume()` resolve constructs via registry.
- Registry builds pipeline helpers/lifecycles per construct.
- Reducers merge diagnostics/trace/usage across construct steps.

## Action items

[x] Implement registry wrapper (`makePipeline` helpers + lifecycles).
[x] Add builtin primitives for model/tools/retrieval/trace.
[x] Add construct + provider registration API with diagnostics.
[x] Route runtime run/resume through registry.
[x] Add tests for registry resolution + builtin primitives + mixed provider run.
[x] Update docs with registry usage + mix‑and‑match example.

## Tests

- Registry resolution: defaults, overrides, conflicts, missing providers.
- Builtin‑only workflow runs (no external deps).
- Mixed provider run (e.g. AI SDK model + LlamaIndex retrieval).
- Resume preserves provider ids and re‑resolves on resume.

## Risks

- Registry scope creep → keep it limited to resolution + pipeline wiring.
- Compatibility mismatch → diagnostics must be explicit and stable.
- Builtins turning into “shadow implementations” → keep minimal.
