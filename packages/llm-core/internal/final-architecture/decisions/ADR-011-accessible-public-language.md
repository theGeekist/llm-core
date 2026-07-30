# ADR-011 — Accessible Public Language and Progressive Disclosure

Architecture version: v2
Status: proposed
Date: 2026-07-30
Owners: architecture coordinator
Affected tasks: language-audit through language-rollout, specification-contracts through specification-api, adapter-openspec through adapter-bmad-release
Supersedes: ADR-002's naming-process rule for future capability work, not its record of shipped names

## Context

Architecture v2 established precise contracts for portability, control,
evidence, state and runtime provenance. The resulting API is safe and
well-separated internally, but ordinary examples now require users to name
runner preparation, bindings, registration, ports, projections and durable
coordination before completing simple agent, tool, workflow or conversation
work.

The proposed specification layer repeats this pattern by turning all eight
internal interoperability seams into public nouns.

Backward compatibility is not required. Naming should therefore be corrected
before the specifications stage adds another public capability.

## Decision

- Insert the language stage before specification work.
- Design the common API from five complete journeys: agent, tool, workflow,
  conversation and specification.
- Classify every public export as common, extension or internal.
- Give common APIs familiar domain nouns and user-intent verbs.
- Reserve `Approval` for an authenticated human decision. Use a scoped
  `Decision` or `Result` when policy, human authority or both may determine the
  outcome.
- Keep security and lifecycle machinery exact, but expose it only where a host
  or adapter author must implement the guarantee.
- Do not make preparation, registration, binding, projection or authority
  verification a manual step in an ordinary journey.
- Prefer one ready-to-use common object over parallel authored, prepared,
  registered and bound nouns.
- Use discriminated results to report lifecycle state where that preserves the
  same safety and portability.
- Replace inferior names and surfaces directly. Do not add aliases,
  compatibility shims or duplicate signatures.
- Treat this ADR as the language-level decision only. It establishes audience
  levels, naming rules, stage order and usability gates; it does not ratify
  exact replacement names.
- Require language-vocabulary to propose ADR-012 with the exact replacement map and public
  surfaces. ADR-012 must be accepted before implementation changes begin.
- Require README-sized typechecked fixtures for every common journey and an
  isolated packed-consumer usability gate.
- Keep `specification-contracts` blocked until the complete language stage
  passes.

## Consequences

The package may make another deliberate breaking replacement before
specification work. Common
usage becomes smaller while extension contracts remain available through
explicit surfaces. Public documentation teaches application actions first and
introduces implementation machinery only in extension guides.

ADR-002, ADR-008 and ADR-009 remain historical authority for names that ship
today. ADR-012, not this decision, will supersede their exact naming clauses.

The root and capability subpaths may change. Package metadata, build
entrypoints, architecture expectations, snippets, examples, migration
guidance, declaration tests and packed-consumer fixtures converge together in
`language-rollout`.

## Rejected alternatives

- Rename only the new specification contracts.
- Keep every current export in place and add friendlier aliases.
- Treat documentation simplification as a substitute for API simplification.
- Remove precise control and provenance concepts from extension contracts.
- Implement specifications first and perform a repository-wide naming cleanup
  afterward.

## Naming and public API impact

The initial findings and proposed direction are recorded in
[`LANGUAGE.md`](../LANGUAGE.md). language-vocabulary owns the ADR-012 proposal and exact
replacement map.

`Specification` remains reserved for specification interoperability. Native
framework terms such as PydanticAI `AgentSpec` remain qualified adapter
language and do not determine the core vocabulary.

## Serialization and compatibility impact

Portable wire semantics remain authoritative. A renamed portable contract must
either preserve its accepted serialized meaning or receive an explicit new
contract/schema version. No legacy TypeScript aliases are retained.

## Verification implications

- Every common journey compiles from the intended public entrypoint.
- Common fixtures do not require internal lifecycle vocabulary.
- Extension fixtures still prove every port and safety guarantee required by
  hosts.
- Runtime and declaration imports pass from the isolated packed package.
- Full tests, typechecks, lint, formatting, examples and documentation pass
  after convergence.

## Follow-up tasks

- language-audit — public language findings and journey contract.
- language-vocabulary — propose ADR-012's exact vocabulary and surface decision.
- `language-rollout` — atomic source, entrypoint, documentation and packed
  usability convergence.
