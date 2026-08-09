---
architecture_version: 2
id: adapters-protocol-qualification
title: Publish exact A2A and stateless MCP protocol surfaces
stage: adapters
status: done
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: coordinator
lease_started_at: 2026-08-09T03:31:44+08:00
lease_expires_at: 2026-08-11T03:31:44+08:00
base_sha: 36543ce8d58cea8008c37df38d0b6b1943310bae
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-external-contract-fidelity
  - runtime-operation-contract-correction
  - architecture-source-layout-normalization
  - runtime-receipt-reconciliation
  - capabilities-operational-evidence
  - architecture-release-reproducibility
  - runtime-tools-front-boundary
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-014
  - ADR-015
  - ADR-017
conflicts_with:
  - adapter-strands-runtime
  - runtime-temporal-reference
  - architecture-status-validation
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - applications-client-subpath-release
  - applications-client-characterization
  - applications-client-platform-qualification
  - applications-desktop
  - applications-mobile
write_scope:
  - bun.lock
  - package.json
  - packages/strict-json/tsconfig.json
  - examples/kitchen-sink/client/tsconfig.json
  - examples/kitchen-sink/server/tsconfig.json
  - examples/agentic/client/tsconfig.json
  - examples/agentic/server/tsconfig.json
  - packages/llm-core/package.json
  - packages/llm-core/src/adapters/protocols/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/runtime.ts
  - packages/llm-core/src/features/evaluation/types.ts
  - packages/llm-core/tests/adapters/protocols/**
  - packages/llm-core/tests/architecture/public-surface-characterization.test.ts
  - packages/llm-core/tests/architecture/source-boundaries.test.ts
  - packages/llm-core/tests/architecture/v2-package-boundaries.test.ts
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - scripts/release-qualifiers.json
  - scripts/sloc-baseline.json
  - packages/llm-core/docs/final-architecture/tasks/architecture-adapter-sloc-decomposition.md
  - .gitignore
  - .prettierignore
  - .eslintignore
  - .bun-version
  - scripts/qualify-release.test.ts
  - scripts/qualify-release.ts
  - scripts/architecture-task-plan.config.ts
  - docs/adapters/index.md
  - docs/adapters/runtime-conformance.md
  - docs/reference/package-exports.md
  - packages/llm-core/docs/final-architecture/tasks/adapters-protocol-qualification.md
required_reading:
  - path: packages/llm-core/tests/adapters/protocols/a2a/authority.json
    reason: "Bind A2A qualification to the official 1.0.0 specification and @a2a-js/sdk 1.0.0 release commits and registry integrity."
  - path: packages/llm-core/tests/adapters/protocols/mcp/authority.json
    reason: "Bind MCP qualification to the official 2026-07-28 specification and stable TypeScript server/client SDK 2.0.0 release commits and registry integrity."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Apply the accepted exact-operation rule separately to A2A and MCP before selecting their recognised authorities and versions."
  - path: packages/aifsd/docs/final-architecture/INTEGRATIONS.md
    reason: "Preserve AIFSD composition ownership and the boundary between protocol engines, integration activation and application-specific bindings."
  - path: context/simple-chat/README.md
    reason: "Keep Simple Chat's scaffold-only status distinct from protocol conformance or implementation evidence."
  - path: context/simple-chat/docs/PLAN.md
    reason: "Deliver both protocol surfaces required by the selected downstream product without moving its coordinator semantics into llm-core."
  - path: context/simple-chat/docs/architecture/authority-map.md
    reason: "Interpret its working-tree ADRs and specifications as downstream reference material under their stated document roles."
  - path: context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
    reason: "Use the consumer's A2A choice as interoperability pressure while qualifying the official pinned A2A contract separately."
  - path: context/simple-chat/docs/protocols/a2a-profile.md
    reason: "Use concrete A2A identity, task, artefact, cancellation and streaming caveats."
  - path: context/simple-chat/docs/protocols/mcp-adapter.md
    reason: "Keep MCP as a stateless compatibility surface over canonical application state."
  - path: context/simple-chat/docs/adr/0004-stateless-mcp-adapter.md
    reason: "Retain the proposed stateless lifecycle rationale while correcting implementation ownership to llm-core plus an application binding."
read_scope:
  - packages/llm-core/tests/adapters/protocols/a2a/authority.json
  - packages/llm-core/tests/adapters/protocols/mcp/authority.json
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/aifsd/docs/final-architecture/INTEGRATIONS.md
  - context/simple-chat/README.md
  - context/simple-chat/docs/PLAN.md
  - context/simple-chat/docs/architecture/authority-map.md
  - context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
  - context/simple-chat/docs/adr/0004-stateless-mcp-adapter.md
  - context/simple-chat/docs/protocols/a2a-profile.md
  - context/simple-chat/docs/protocols/mcp-adapter.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-09
---

# adapters-protocol-qualification — Publish exact A2A and stateless MCP protocol surfaces

## Objective

Implement, qualify and publish distinct A2A 1.0 and stateless MCP protocol
surfaces that AIFSD and Simple Chat can consume without reimplementing either
recognised protocol.

## In scope

- A version-pinned A2A 1.0 surface for Agent Cards, discovery, messages, tasks,
  parts, artefacts, send, streaming, subscription, cancellation, remote
  identity, delegation, errors and extension negotiation.
- A separately version-pinned stateless MCP surface for per-request lifecycle,
  tool and resource catalogues, application handler registration,
  authentication and authorisation hooks, controlled invocation, cancellation,
  errors and explicitly qualified legacy stateless compatibility when retained.
- Separate exact operation matrices, threat models and conformance fixtures for
  A2A and MCP. Sharing one task and release gate does not merge their native
  contracts or imply conversion between them.
- Exact current official A2A and MCP specifications, SDK versions and
  conformance sources added to `required_reading` before claim; mounted consumer
  material is context and never substitutes for upstream authority.
- Exact direct development dependencies on the qualified MCP and A2A SDKs in
  the package manifest and root lockfile. Source and tests must not rely on
  transitive dependencies.
- A task-owned
  `tests/adapters/protocols/external-consumer` fixture with its own manifest and
  lockfile, exact SDK pins and no root/workspace dependency fallback.
- MCP tool calls entering the normal schema, policy, approval, receipt and
  cancellation path.
- A2A remote identity, delegation, events, session/checkpoint and failure
  contracts that remain A2A-native unless an exact portable operation is
  separately proved.
- Public `@geekist/llm-core/a2a` and `@geekist/llm-core/mcp` subpaths, package
  build entrypoints, declarations, smoke coverage and isolated packed-consumer
  imports delivered in this task rather than deferred to an unnamed release
  task.
- An MCP application-binding boundary through which a trusted application host
  registers tool and resource schemas, handlers and request-level
  authorisation. The boundary carries application semantics without giving the
  protocol transport authority over them.

## Out of scope

- Treating an MCP server or A2A peer as trusted authorisation, remote-agent
  checkpoint portability, or a generic team API.
- Simple Chat channels, membership, coordinator sessions and generations,
  delivery leases, replay, idempotency policy, presence, receipts, catalogue
  contents or MCP-to-A2A application mapping. Those remain downstream
  application-binding semantics.
- AIFSD integration selection, activation, catalogue trust or product
  composition.

## Acceptance criteria

- Protocol metadata cannot bypass action digest, policy or approval checks.
- A2A state and delegation retain their remote/native owner unless an exact
  portable mapping is tested.
- A2A and MCP are independently importable, versioned and qualified; neither
  public surface is an alias, projection or lossy wrapper around the other.
- AIFSD and an isolated Simple Chat-shaped consumer can construct both public
  surfaces using only packed package exports and application-owned bindings.
- Every supported and unsupported operation plus its exact source version is
  declared before the corresponding package export is admitted.
- Package source and conformance fixtures resolve the same exact qualified SDK
  versions from direct dependency declarations.
- The external fixture performs a frozen install, asserts resolved package
  names and versions, and runs the supported MCP/A2A boundary checks.

## Verification

```sh
bun install --frozen-lockfile
bun install --cwd packages/llm-core/tests/adapters/protocols/external-consumer --frozen-lockfile
bun run qualify:external-fixtures
bun test packages/llm-core/tests/adapters/protocols
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-013 and hardened by ADR-014; not claimed.

Execution mode: shared-checkout
Execution rationale: One coordinator must own the shared package publication boundary while two task-local workers implement disjoint protocol lanes in parallel.
Concurrency evaluation: none; start alongside no other active task. The only dirty paths at claim are the two task-owned authority fixtures ADR-017 required before claim.
Concurrent task scopes: none
Swarm delegation: `codex-root` -> `a2a_lane`: A2A implementation and qualification; `packages/llm-core/src/adapters/protocols/a2a/**` and `packages/llm-core/tests/adapters/protocols/a2a/**` except coordinator-owned `authority.json`. `codex-root` -> `mcp_lane`: stateless MCP implementation and qualification; `packages/llm-core/src/adapters/protocols/mcp/**` and `packages/llm-core/tests/adapters/protocols/mcp/**` except coordinator-owned `authority.json`.

2026-08-08: Corrected the sequence after downstream product review. A2A and
MCP remain distinct recognised protocols but share one task because their
direct dependencies, package manifest, lockfile, build entrypoints and packed
consumer gate are one write boundary. Removed the unrelated connector
authorisation lifecycle dependency, made the existing tools-front correction
the direct prerequisite, and brought both consumable subpaths into scope.

2026-08-09: Before claim, the coordinator selected and recorded the recognised
official authorities required by ADR-017: A2A specification 1.0.0 at
`173695755607e884aa9acf8ce4feed90e32727a1` with `@a2a-js/sdk@1.0.0`, and MCP
specification `2026-07-28` at `5f5440bb26a62e2cf3440b92da5a667efa03b267`
with stable `@modelcontextprotocol/server@2.0.0` and
`@modelcontextprotocol/client@2.0.0`. Immutable release tags and registry
integrities are stored in task-owned authority fixtures and added to required
reading. Downstream Simple Chat drafts remain consumer context only.

2026-08-09: Claimed by `codex-root` from
`36543ce8d58cea8008c37df38d0b6b1943310bae`. The task runs as one coordinator
lease with independent A2A and MCP implementation lanes. The coordinator owns
manifest, lockfile, build, export, shared external-consumer, documentation and
final release qualification files.

2026-08-09: Corrected the coordinator write scope before publication work to
include the package TypeScript path/declaration entrypoint configuration and
the durable release-qualifier registry required by ADR-015. These are shared
publication-boundary files, do not overlap either delegated protocol lane and
are necessary to make the two new conditional exports both consumable and
release-qualified.

2026-08-09: Added the SLOC baseline to coordinator scope for the A2A validator's
permitted lightweight waiver. `packages/llm-core/src/adapters/protocols/a2a/validation.ts`
is 560 physical lines and records the complete permitted justification
`approximately 500 lines`; no decomposition, expiry or follow-up is required
for the 501 through 600 band.

2026-08-09: The release SLOC gate exposed three pre-existing adapter modules
above 600 lines whose committed content had drifted from their sealed legacy
digests before this task. With the user's explicit permission for non-AIFSD
SLOC tooling, recorded time-bounded versioned waivers and planned
`architecture-adapter-sloc-decomposition`; no OpenSpec, PydanticAI or Spec Kit
source was changed here.

2026-08-09: Added the repository root `.gitignore` to coordinator scope at the
user's request and recorded `.gitnexus/`, `.codex/` and
`.claude/settings.local.json` explicitly. Those paths were already untracked
through local or global excludes; no GitNexus or local agent-client state was
committed. Repository-owned `AGENTS.md`, `CLAUDE.md` and `.claude/skills/**`
remain tracked.

2026-08-09: Added the same local-state paths to the root Prettier and ESLint
ignore files so repository-wide tooling does not traverse GitNexus or local
agent-client configuration.

2026-08-09: Expanded coordinator scope to the three package architecture
characterisation suites after the release gate exposed their shared
publication assumptions. They now recognise the explicit A2A and MCP exports,
the independently owned protocol child fronts, and exclude the isolated packed
consumer's `node_modules` from repository source-layout scans. MCP now consumes
the published tooling runtime front rather than a private feature module.

2026-08-09: User decision: because the project is pre-compatibility, keep Bun
current rather than preserving the historical 1.3.8 tool pin. Updated the
canonical pin and release-orchestrator fixtures to Bun 1.3.14; workflows
continue to resolve the version through `.bun-version`.

2026-08-09: Corrected the canonical release runner's operator boundary after a
long silent qualification obscured the active gate. The default runner now
announces every command, streams its stdout and stderr directly, and records
elapsed time while preserving injected-runner behaviour for unit tests.

2026-08-09: User decision: keep the pre-compatibility compiler toolchain
current. Adopted the official TypeScript 7 side-by-side model:
`@typescript/native` aliases `typescript@^7.0.2` and supplies `tsc`, while
`typescript@6.0.2` supplies the compiler API required by tools such as
typescript-eslint. This is the Bun-compatible form of the official side-by-side
arrangement; Bun 1.3.14 recursively resolves the documented
`@typescript/typescript6` alias. Raised both typescript-eslint packages from
6.21.0 to the current stable 8.66.0 release.

2026-08-09: The current typescript-eslint rules identified three empty
interface aliases in existing llm-core sources. Replaced them with equivalent
type aliases, with no runtime or serialized-contract change.

2026-08-09: Replaced the root ESLint catch-all glob with explicit strict-json,
llm-core, AIFSD, scripts, examples and documentation-snippet lanes. This keeps
the same repository source coverage, excludes local hidden state by
construction, and exposes package-level progress through the streaming release
runner.

2026-08-09: The upgraded lint rules identified a type-only priority tuple in
the task planner configuration. Replaced it with the equivalent literal union;
planner behaviour and serialized task vocabulary are unchanged.

2026-08-09: Review remediation now rejects proxies through the runtime's native
proxy identity check, then detaches native A2A values through the
descriptor-safe boundary before any semantic or SDK codec read. Root and
nested proxies fail without executing `get`, `getPrototypeOf`, `ownKeys` or
`getOwnPropertyDescriptor` traps, and native trap errors cannot escape. The A2A
timestamp boundary validates real calendar instants, the protobuf year range
and canonical zero, millisecond, microsecond or nanosecond precision rather
than accepting JavaScript date normalisation. Every operation fixture now
resolves to an exact executable test title from both repository-root and
package-local test execution.

2026-08-09: Independent review approved the completed protocol qualification
with no findings. The reviewer confirmed zero hostile proxy trap executions,
closed `A2AContractError` rejection without provider-error leakage, 61 protocol
tests with 232 assertions, 713 package tests with 4 optional skips and 2,536
assertions, passing lint, typecheck, build and direct packed A2A and MCP
consumer qualification. The coordinator transitioned the task to `done` before
staging the approved repository diff.

## Handoff

Independently approved in the canonical shared checkout and ready for commit.

- The A2A and MCP lanes were implemented independently and each passed an
  independent task-local review after remediation.
- The combined protocol suite passes 61 tests with 232 assertions. A2A covers
  the pinned 1.0.0 SDK surface, native task/message semantics, cancellation,
  streaming, subscription and extension negotiation. MCP covers the pinned
  2.0.0 server/client surface, stateless controlled tool execution, policy,
  approval, receipts, cancellation and sanitised failures.
- `@geekist/llm-core/a2a` and `@geekist/llm-core/mcp` are distinct package
  exports with declarations, build entrypoints and package smoke coverage.
- The isolated external consumer passes frozen installation and packed A2A and
  MCP qualification against the exact direct SDK dependencies, without a
  workspace fallback.
- The canonical `release:qualify:llm-core` gate passes on Bun 1.3.14 and
  TypeScript 7.0.2. Its package release build passes 713 tests with 4 optional
  skips and 2,536 assertions, then package smoke and both packed protocol
  consumers pass.
- Package and test typechecks pass using TypeScript 7.0.2. TypeScript 6.0.2 is
  retained only as the compiler API used by typescript-eslint under the
  official side-by-side toolchain model.
- SLOC, package formatting and `git diff --check` pass. The 600-line A2A
  validator uses only the permitted `approximately 500 lines` lightweight
  waiver. No AIFSD implementation path was changed.
