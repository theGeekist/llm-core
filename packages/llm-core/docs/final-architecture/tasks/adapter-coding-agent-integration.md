---
architecture_version: 2
id: adapter-coding-agent-integration
title: Characterize and qualify a coding-agent integration
stage: adapters
status: done
priority: high
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: codex
lease_started_at: 2026-08-10T15:19:38+08:00
lease_expires_at: 2026-08-11T15:19:38+08:00
base_sha: e91f1fa36dbbc63b961c5b646c256e5372bd5717
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-external-contract-fidelity
  - architecture-runtime-ownership-correction
  - capabilities-runtime-conformance
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - apps/coding-agent-qualification/**
  - packages/llm-core/src/adapters/coding-agent/**
  - packages/llm-core/tests/adapters/coding-agent/**
  - docs/adapters/coding-agent.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-coding-agent-integration.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/INTEGRATIONS.md
    reason: "Preserve coding-agent ownership, permissions and evidence boundaries in product composition."
  - path: context/aifsd-research/profiles/claude-agent-sdk.md
    reason: "Use one researched coding-agent boundary as selection evidence."
  - path: context/aifsd-research/profiles/openhands-sdk.md
    reason: "Compare an unlike coding-agent boundary before selecting the qualified target."
read_scope:
  - packages/aifsd/docs/final-architecture/INTEGRATIONS.md
  - packages/aifsd/tests/fixtures/integrations/openhands/**
  - context/aifsd-research/profiles/claude-agent-sdk.md
  - context/aifsd-research/profiles/openhands-sdk.md
  - packages/llm-core/src/adapters/protocols/mcp/operation-matrix.ts
  - packages/llm-core/src/adapters/runtimes/**
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/shared/portable-data.ts
  - packages/llm-core/tests/adapters/protocols/mcp/**
  - packages/llm-core/tests/conformance/**
review_owner: human
updated_at: 2026-08-10
---

# adapter-coding-agent-integration — Characterize and qualify a coding-agent integration

## Objective

Select and qualify one real coding-agent boundary—such as Codex, Claude Agent
SDK or OpenHands—for repository work, workspace controls, events, artifacts and
evidence without rebuilding its loop in `llm-core`.

## In scope

- Compare candidate coding-agent boundaries and select one exact version.
- Implement only the portable adapter projection required by the governed
  repository-change fixture.
- Characterize permissions, workspace ownership, cancellation, artifacts,
  sessions and supported or unsupported evidence operations.

## Out of scope

- Implementing a coding-agent loop or workspace engine in `llm-core`.
- Publishing the adapter or promising support for unqualified versions.
- Generalizing behavior not exercised by the selected fixture.

## Acceptance criteria

- The selection records operating boundary, permissions, workspace ownership,
  cancellation, artifacts and native session semantics.
- One governed repository-change fixture produces normalized evidence.
- Native trajectory and workspace state remain owned by the coding agent.
- Publication, if any, is a separate exact-version support decision.

## Verification

```sh
UV_PROJECT_ENVIRONMENT=/private/tmp/llm-core-coding-agent-qualification-venv uv sync --frozen --project apps/coding-agent-qualification
OPENHANDS_QUALIFICATION_PYTHON=/private/tmp/llm-core-coding-agent-qualification-venv/bin/python bun test apps/coding-agent-qualification packages/llm-core/tests/adapters/coding-agent
bun run docs:check
bun run check:sloc
```

The exact locked interpreter remains outside the repository so generated
dependency trees cannot enter package or SLOC evidence.

## Work log

Execution mode: shared-checkout

Execution rationale: The adapter, isolated qualification application, focused
tests, public adapter page and task record form one disjoint slice in the
canonical coordination checkout.

Concurrency evaluation: `architecture-status-validation`; start alongside
because its source, test and task paths are disjoint from this task's declared
write scope. Its generated `STATUS.md` ownership remains exclusive.

Concurrent task scopes: `architecture-status-validation` owns
`packages/llm-core/scripts/check-architecture-status.ts`,
`packages/llm-core/tests/architecture/architecture-status-*.ts`, its task brief
and generated `STATUS.md`; this task leaves those paths untouched.

Swarm delegation: none

- 2026-08-10 — Compared the researched Claude Agent SDK and OpenHands Software
  Agent SDK boundaries. Claude Agent SDK `0.2.128` embeds the capable but opaque
  Claude Code `2.1.220` runtime, with permission-precedence and best-effort
  transcript-mirroring caveats that require a coupled two-version support
  claim. OpenHands exposes its agent loop, typed event tree, workspace boundary,
  interruption and native session state in the inspected source and already has
  an AIFSD qualification precedent for its native event contract.
- 2026-08-10 — Selected exact target OpenHands Software Agent SDK `1.37.1`,
  package line `openhands-sdk==1.37.1`, at research revision
  `310989d306114efd0fcadbcbed9ff9c21d4a5963`. Qualification is limited to the
  governed repository-change fixture and does not claim later versions,
  distributed workflow durability, exactly-once effects or publication support.
- 2026-08-10 — Claimed by `codex-root` on shared `main` at base
  `e91f1fa36dbbc63b961c5b646c256e5372bd5717`. The existing dirty paths were
  confirmed outside this task's write scope before implementation.
- 2026-08-10 — Remediated qualification review findings by introducing a
  macOS sandbox executor with an environment allowlist and executable denial
  probes, deriving portable event identity from validated native
  `MessageEvent` serialisation, rejecting proxies before reflection at every
  recursive visit, decomposing projection validation for the lint gate and
  binding evidence to the lock, probe, installed distribution closure,
  interpreter and platform.
- 2026-08-10 - Bounded the sandboxed native probe with asynchronous process
  execution, explicit termination and cleanup. A deliberately blocking probe
  proves the deadline without weakening the deny-default sandbox profile.

## Handoff

Implementation and independent review are complete.

- Added an internal OpenHands coding-agent adapter front with the exact
  operation matrix, permission and ownership profile, closed hostile-input
  validation and content-addressed repository-change evidence projection.
- Added an isolated Python 3.12 qualification application locked to
  `openhands-sdk==1.37.1`. The `uv.lock` SHA-256 is
  `9dffe5d1a15449bfe6cbb91bee0ccf1698d5c781bb4e1d3a9bc294667b62b33b`;
  the native probe SHA-256 is
  `8788f1cbc05bd29e24e8e5573f10ebf4fcdddff410cddc35abd12cf6f4888391`.
- Bound qualification evidence to CPython `3.12.12` on Darwin arm64 and the
  125-distribution installed closure SHA-256
  `adc85b9508113e39f1bbcb9eded886fe09155e88120881ebd2cdf3a8c435c8d2`.
  The probe runs inside `sandbox-exec` with no ambient environment inheritance,
  no credential variables and executable denials for host-file reads,
  host-file writes and network connections.
- Qualified native `MessageEvent` serialization and native `LocalWorkspace`
  upload/download against the governed repository-change fixture. The
  portable boundary exposes only identities, ownership, permissions, digests
  and byte lengths.
- Observed that a relative OpenHands `LocalWorkspace.file_upload` destination
  resolves against the host process directory. The final fixture confines an
  absolute native destination beneath its temporary workspace and exposes only
  a validated logical path. The transient untracked probe file created during
  that characterization was removed immediately; no out-of-scope diff remains.
- Supported operations are native message-event round trip, native local
  workspace file round trip and portable repository-change evidence.
  Agent-loop execution, live cancellation, session resume and distributed
  workflow durability remain explicitly unsupported.
- Focused verification passes: nine tests with 51 assertions, exact locked
  upstream execution, package typecheck, repository lint, targeted formatting
  and diff checks. Every task-owned source or test module remains below 500
  physical lines.
- The sandboxed native qualification includes a 20-second production deadline
  and a 100 ms blocking-probe regression. Independent re-review found no
  surviving probe or sandbox descendants after termination.
- `bun run check:sloc` passes for all 540 checked source modules. Final
  repository and documentation gate evidence is recorded by the coordinating
  status task.
- Publication recommendation: do not publish. A package export, maintenance
  owner and exact-version release qualification remain a separate decision.
