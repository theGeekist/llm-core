# V2 public documentation review handoff

## Responsibility

This handoff records the completed review of the published V2 documentation: its accuracy, coverage, voice, navigation, snippets, and visuals. It deliberately excludes implementation sequencing and open code-review findings.

For live execution state, read [the implementation handoff](./implement-v2-arch.md). For code findings, read [the architecture review](./review-v2-arch.md).

## Review snapshot and scope

The content review closed at `04ad5ad`; no actionable documentation findings remained at that snapshot. The later accessible-language rollout intentionally replaces some names and removes the public `./functional` page, so this review is historical evidence rather than authority for restoring the earlier surface.

The review checked:

1. prose and snippets against exported TypeScript, tests, runtime behavior, and accepted ADRs;
2. adherence to the documentation voice and information architecture;
3. coverage of ordinary journeys, advanced capabilities, failures, and migration;
4. Mermaid semantics, readability, responsiveness, and light/dark rendering; and
5. governance of the content plan, sidebar, snippet inventory, and public-subpath coverage.

## Corrections completed

The review resulted in these public-documentation corrections:

- separated tool effect risk from idempotency and documented the exact `ActionDigest` contract;
- distinguished the five state lifetimes and raw checkpoints from registered, compatibility-checked resume inputs;
- documented deterministic model resolution, model/tool agents, agent skills, capability registration, and qualified retry;
- documented receipt recovery, effect dispositions, redaction, reconciliation, and the non-authoritative nature of event projections;
- clarified optional, capability-gated agent resume and non-terminal paused workflow outcomes;
- kept agent, controlled-execution, and interaction event families distinct;
- corrected workflow composition, interaction persistence, adapter direction, and capability-port ownership language;
- expanded V2 migration coverage for removed diagnostics, `Pack`, `Plugin`, broad adapter imports, and removed framework adapter paths;
- added context and artifact provenance visuals, split the workflow diagram, corrected state and adapter diagrams, and added theme-aware Mermaid rerendering;
- added the Chromium Mermaid smoke gate;
- reconciled the checked-snippet inventory and made public subpaths—not every individual export—the coverage unit;
- removed duplicated controlled-execution sequencing from the Control page in favor of one canonical orchestration explanation; and
- corrected the sync-preserving `maybeToStep` description and completed model-resolution failure coverage.

The content corrections were integrated through `86d8f40`, `1bfa694`, `b6b0c81`, and `04ad5ad`. Code changes referenced by the prose were independently reviewed rather than inferred from commit summaries.

## Verification at review close

At `04ad5ad`:

- 42 pages were published;
- 25 embedded snippets typechecked;
- all sidebar links resolved;
- the VitePress production build passed;
- 22 Mermaid diagrams rendered in Chromium, including theme rerender verification;
- package TypeScript checking passed; and
- 513 tests passed, zero failed, with one optional live-PydanticAI execution skipped because its Python package was absent.

These counts describe the reviewed snapshot. The accessible-language rollout has its own newer validation baseline in the implementation handoff.

## Authoritative content sources

Internal documentation governance:

- [V2 content plan](../.internal/V2-CONTENT-PLAN.md)
- [V2 information architecture](../.internal/V2-IA.md)
- [Style and voice](../.internal/STYLE.md)

Primary public entrypoints:

- [Documentation home](../index.md)
- [Hello world](../guide/hello-world.md)
- [Core concepts](../guide/core-concepts.md)
- [Agent guide](../guide/agent.md)
- [Workflow guide](../guide/workflow.md)
- [Tools](../capabilities/tools.md)
- [Control](../capabilities/control.md)
- [State and durability](../capabilities/state.md)
- [Agent skills](../capabilities/agent-skills.md)
- [Controlled tool execution](../orchestration/controlled-tool-execution.md)
- [Public vocabulary](../reference/vocabulary.md)
- [API overview](../reference/api.md)
- [Failures and diagnostics](../reference/failures.md)
- [Package exports](../reference/package-exports.md)
- [Migration guide](../reference/migration-2.md)

## Use in future content reviews

Repeat this review when public vocabulary, exports, runtime semantics, or navigation changes. A content change is complete only when:

- published claims match public types, implementation behavior, and tests;
- examples and snippets use the current surface without compatibility aliases;
- the content plan, information architecture, sidebar, migration guide, and reference pages agree;
- one concept has one canonical explanation, with other pages linking to it;
- portable descriptions are not presented as executable authority;
- capability-gated behavior is not described as universally available; and
- docs build, link checks, snippet typechecking, and Mermaid browser rendering all pass.

A passing docs build proves renderability, not semantic accuracy.
