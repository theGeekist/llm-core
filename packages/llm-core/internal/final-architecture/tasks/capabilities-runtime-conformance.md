---
architecture_version: 2
id: capabilities-runtime-conformance
legacy_id: P1-230
title: Conformance suite and second runtime
stage: capabilities
status: done
priority: high
preferred_owner_kind: codex
owner: codex-conformance-runtime
owner_kind: codex
lease_started_at: 2026-07-30T03:44:18+08:00
lease_expires_at: 2026-08-01T03:44:18+08:00
base_sha: e72d312e3f9d966acc2b96548c42b122498b3315
branch: task/P1-230-conformance
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P1-230-conformance
depends_on:
  - core-convergence
  - core-ai-sdk-adapter
  - core-interactions
decision_dependencies:
  - ADR-007
conflicts_with: []
write_scope:
  - packages/llm-core/tests/conformance/**
  - packages/llm-core/src/adapters/runtimes/**
  - packages/llm-core/internal/final-architecture/tasks/capabilities-runtime-conformance.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-07-30
---

# capabilities-runtime-conformance — Conformance suite and second runtime

## Objective

Prove the finalized contracts are portable by running shared conformance fixtures against the local runtime and one non-TypeScript runtime boundary.

## Deliverables

- Conformance fixtures for model, tool, control, event, state, and continuation behavior.
- A deterministic fake-remote adapter for fault and replay cases.
- One bounded second-runtime bridge selected when the task is claimed.
- A compatibility report covering supported, projected, and unsupported semantics.

## Acceptance criteria

- The same fixtures exercise local and remote-style execution.
- Transport and provider details remain inside adapter scope.
- Unsupported semantics fail explicitly rather than silently degrading.
- Shared manifest, export, and fixture edits remain coordinator-owned.

## Verification

```sh
bun test packages/llm-core/tests/conformance
bun run typecheck:packages
```

## Work log

- 2026-07-30T03:44:18+08:00 — Claimed by the Codex conformance/runtime
  worker after core-convergence completed and merged at
  `e72d312e3f9d966acc2b96548c42b122498b3315`.
- 2026-07-30 — The architecture coordinator selected PydanticAI as the first
  bounded Python reference runtime. The research assessment identifies it as
  the default typed, provider-neutral Python substrate and the closest direct
  precedent for llm-core agent specifications and model profiles. The adapter
  must still declare versioned support and explicit semantic loss.
- 2026-07-30T03:47:00+08:00 — Implementation started. The bridge is bounded to
  the assessed PydanticAI v2.19.0 release and remains transport-neutral; shared
  conformance fixtures exercise the local runner and a deterministic
  fake-remote runner separately from the Python runtime declaration.
- 2026-07-30 — Shared fixtures passed against the local runner, the
  deterministic fake-remote runner, and a real CPython 3.14.6 NDJSON process.
  PydanticAI is not installed in this worktree, so the PydanticAI runner
  correctly failed its availability handshake; no PydanticAI runtime
  conformance claim was minted from the transport-only result.
- 2026-07-30 — Moved to review at implementation commit
  `3c1913a2eefcb29d75520aac32bd1d29f8500244`.
- 2026-07-30 — Review remediation added an isolated CPython 3.14.6 environment
  pinned to `pydantic-ai-slim==2.19.0`. The positive matrix now executes the
  real Agent/TestModel tool loop and preserves its tool call ID, arguments,
  return and serialized message history. Missing-package behavior is covered
  independently and deterministically.
- 2026-07-30 — Review findings remediated at
  `b55e2a35b9ac420f9745b18ec7953fb9d85558e9`.
- 2026-07-30 — Core identity review findings remediated at
  `c321545d33ea9c40e40ae94dfb2448f91bebb23b`: the
  Python peer now mints a fresh RFC 9562 UUIDv7 for every run and event, the
  TypeScript boundary requires UUIDv7, and identical-start collision coverage
  passes in both runtime matrices.
- 2026-07-30 — Text projection review finding remediated at
  `454a6f5033ee03a359e8eeb597b1183df27eae09`: the Python Agent now receives
  the literal prompt and the exact-runtime fixture verifies its serialized
  `UserPromptPart`.
- 2026-07-30 — Independently approved at exact SHA `d36301b`. Default
  conformance passed 14 tests with one intentional exact-runtime skip; the
  isolated CPython 3.14.6 plus exact `pydantic-ai-slim==2.19.0` matrix passed
  15/15. Typechecks, schema, architecture, identity, lint, formatting and diff
  checks passed.
- 2026-07-30 — Integrated into `main`. CI now provisions Python 3.14 and exact
  `pydantic-ai-slim==2.19.0` in an isolated environment and runs the same
  conformance suite with the positive availability gate. The runtime front
  remains internal, so no Python asset or additional package export is shipped.

## Handoff

- Implementation commit:
  `3c1913a2eefcb29d75520aac32bd1d29f8500244`, with exact-runtime review
  remediation at `b55e2a35b9ac420f9745b18ec7953fb9d85558e9` and UUIDv7
  remediation at `c321545d33ea9c40e40ae94dfb2448f91bebb23b`; final text
  projection remediation is `454a6f5033ee03a359e8eeb597b1183df27eae09`.
- Changed files:
  - `packages/llm-core/src/adapters/runtimes/fake-remote.ts`
  - `packages/llm-core/src/adapters/runtimes/index.ts`
  - `packages/llm-core/src/adapters/runtimes/pydantic-ai-support.ts`
  - `packages/llm-core/src/adapters/runtimes/pydantic-ai.ts`
  - `packages/llm-core/src/adapters/runtimes/pydantic_ai_bridge.py`
  - `packages/llm-core/src/adapters/runtimes/stdio.ts`
  - `packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts`
  - `packages/llm-core/tests/conformance/runner-conformance.test.ts`
  - `packages/llm-core/tests/conformance/runner-fixtures.ts`
  - this task file
- Verification after `bun install --frozen-lockfile`:
  - default `bun test packages/llm-core/tests/conformance` — exit 0, 14 pass,
    1 optional exact-runtime skip, 0 fail.
  - with `LLM_CORE_PYDANTIC_AI_PYTHON` set to an isolated CPython 3.14.6
    environment containing exact `pydantic-ai-slim==2.19.0` — exit 0,
    15 pass, 0 fail.
  - `bun run typecheck:packages` — exit 0; package typecheck and generated
    contract schema check passed.
  - `bun run typecheck:tests` — exit 0.
  - focused ESLint and Prettier checks for runtime/conformance paths — exit 0.
  - source and v2 package boundary architecture tests — exit 0, 5 pass.
  - `git diff --check` — exit 0.
- ADR-007 is applied without deviation: local plus Python references remain
  distinct, versions and semantic loss are explicit, and transport/provider
  details remain under `src/adapters/runtimes`.
- Compatibility report:
  - assessed source: PydanticAI v2.19.0,
    `ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5`, Python 3.10–3.14;
  - executable support target: exact `pydantic-ai-slim==2.19.0`;
  - supported: literal text prompts and allowlisted process-local read-only
    function tools, including real call identity, arguments and results;
  - projected/lossy: Python `output_type`, cross-language JSON output,
    normalized lifecycle events, and caller-managed message history;
  - unsupported/fail-closed: controlled effects and approval authority,
    skills, arbitrary metadata/templates/input, binary/media/reasoning/native
    values, cancellation, interventions, checkpoint resume, provider sessions,
    durable/live continuation, and recorded-effect semantics.
- Risks:
  - The default environment intentionally lacks PydanticAI; exact-runtime
    conformance depends on the isolated interpreter supplied through
    `LLM_CORE_PYDANTIC_AI_PYTHON`.
  - The Python source asset is not copied by the current TypeScript-only build.
  - The qualified runtime front is internal and is not part of the public
    package export surface.
- Coordinator integration result:
  - `.github/workflows/ci.yml` runs the exact PydanticAI availability matrix.
  - `packages/llm-core/scripts/build.ts` does not copy the Python source because
    this conformance/reference front is not a shipped public runtime adapter.
  - No additional `packages/llm-core/package.json` runtime export was added.
    Prefer an optional runtime package if public shipment is later approved.
