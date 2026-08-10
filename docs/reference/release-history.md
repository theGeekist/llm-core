# Release history

`llm-core` has had two distinct 1.x implementations and is now moving towards version 2.

This document records the major releases and architectural milestones across both implementations. Detailed provenance, qualification evidence and release receipts are maintained separately.

There are two separate 1.x histories:

| Series  | Package                 | Repository                     | Notes                      |
| ------- | ----------------------- | ------------------------------ | -------------------------- |
| Legacy  | `@jasonnathan/llm-core` | Historical personal repository | Original implementation    |
| Current | `@geekist/llm-core`     | `theGeekist/llm-core`          | Rewrite and current source |

They share a project lineage, but they are separate implementations and should not be treated as one continuous version history.

The project later moved into the `theGeekist` GitHub organisation, which is now the canonical home of the source.

npm package history is separate from repository ownership. Existing releases remain under the coordinates they were published with, including the original `@jasonnathan/llm-core` releases and the later `@geekist/llm-core` 1.x line. The current v2 candidates use the `@aifsd` npm organisation for llm-core, the AIFSD SDK and related packages. This history records a candidate coordinate as current package state, but treats it as pin-ready only when registry evidence exists.

## Legacy 1.x

The original `@jasonnathan/llm-core` package was developed between July and September 2025, progressing from `1.0.0` through `1.9.1`.

There were 33 tagged versions during that period. The useful history falls into four broad stages rather than 33 individual release notes.

### 1.0.x: Foundation

The first releases established the package structure, core abstractions, refactoring direction, branding and test coverage.

`1.0.0` was tagged on 9 July 2025, followed by a rapid sequence of maintenance releases through `1.0.8`.

### 1.1 to 1.3: Pausable pipelines

The next phase introduced streaming with pause support and started reshaping the pipeline around resumable execution.

The `1.1.x` to `1.3.x` releases iterated heavily on pipeline contracts, implementation structure and package distribution as that model settled.

### 1.4 to 1.6: Context-owned resumable execution

The `1.4.x` to `1.6.x` releases reworked how execution state was represented.

Steps became context-owned, resume tokens became part of the execution model, public types changed and several transform-resume edge cases were corrected.

`1.4.0` included an explicit breaking change.

### 1.7 to 1.9: Services, helpers and batch execution

The final legacy releases expanded the API around the pipeline.

They added more helpers and chunking support, resumable OpenAI batch work, service refinements and internal environment handling.

The final tagged legacy release was:

```text
@jasonnathan/llm-core@1.9.1
```

on 17 September 2025.

### Legacy release timeline

| Versions                    | Date              |
| --------------------------- | ----------------- |
| `1.0.0`                     | 9 July 2025       |
| `1.0.1` to `1.0.6`          | 10 July 2025      |
| `1.0.7` to `1.0.8`          | 11 July 2025      |
| `1.1.0`, `1.2.0` to `1.2.3` | 23 July 2025      |
| `1.3.0` to `1.3.4`          | 30 July 2025      |
| `1.3.5`                     | 24 August 2025    |
| `1.3.6` to `1.3.8`          | 25 August 2025    |
| `1.4.0` to `1.7.1`          | 14 September 2025 |
| `1.8.0` to `1.9.0`          | 16 September 2025 |
| `1.9.1`                     | 17 September 2025 |

Some of the original Git history was rewritten over time, so a number of old changelog commit links no longer resolve cleanly. The annotated release tags remain the better historical anchors.

## The rewrite

Work on the current implementation began on 21 December 2025.

It was a rewrite rather than a continuation of the original package internals. The legacy package and the current implementation therefore have separate histories even though they solve the same class of problem.

The early changelog creates one slightly confusing piece of history. Development stages were given version-like headings from `1.0.0` through `1.21.0`, even though most of those were development milestones rather than published npm versions.

The package manifest itself went through a much shorter progression:

| Version    | Meaning                                  |
| ---------- | ---------------------------------------- |
| no version | Initial rewrite development              |
| `0.1.0`    | Early development state                  |
| `1.0.0`    | Later development state                  |
| `1.21.0`   | Start of the public rewrite release line |

A changelog heading such as `1.8.0` therefore does not mean `@geekist/llm-core@1.8.0` was published to npm.

## Rewrite 1.x

The rewrite developed through three broad stages.

### Foundations

The first stage established the new workflow model, outcomes, diagnostics, recipe and plugin composition, interoperability adapters and dependency signalling.

This work remained in development and eventually reached a `0.1.0` manifest state.

### Resume, persistence and recipes

The next stage added pause and resume behaviour, cache and session persistence, RAG support, adapter parity and increasingly composable recipes.

Resume semantics changed several times during this period as the execution model converged.

### Interaction core and 1.21

The final 1.x phase completed interaction and session orchestration, UI adapters and the surrounding transport model.

That became the public `1.21.x` release line:

| Version  | Status        |
| -------- | ------------- |
| `1.21.0` | Published     |
| `1.21.1` | Not published |
| `1.21.2` | Published     |
| `1.21.3` | Published     |
| `1.21.4` | Published     |
| `1.21.5` | Published     |

`1.21.1` has an unusual history. A `v1.21.1` Git tag exists, but its target still contains a `1.21.0` package manifest. The actual `1.21.1` manifest bump happened later and that version was never published to npm.

The tag is retained as part of the repository history rather than being retroactively normalised.

The latest published rewrite release is:

```text
@geekist/llm-core@1.21.5
```

## Version 2

Version 2 is a substantial architectural change built from the current codebase.

The `2.0.0` version first appeared in the package manifest during the v2 architecture work. Development since then has focused on the runtime kernel, protocol boundaries, package-level qualification and tightening the relationship between source, built artefacts and published packages.

Several milestones are worth calling out.

### Monorepo migration

The repository moved to a monorepo while the published package was still on `1.21.5`.

This gave llm-core and its surrounding packages independent package boundaries while keeping development in one repository.

### Architecture v2

The first v2 architecture pass established the new package surface and execution model.

Later work completed the runtime kernel and clarified the ownership boundaries between llm-core itself, protocol adapters and the surrounding qualification tooling.

### Package-level qualification

The release model also changed.

Source tests remain useful, but they do not prove that the package someone installs contains exactly what the source tree suggests it contains.

v2 therefore moved qualification towards packed packages and real consumers. The distributable archive increasingly became the unit being tested rather than the repository checkout alone.

### `strict-json`

Canonical JSON handling was extracted into its own package:

```text
@aifsd/strict-json@0.1.0
```

This keeps a low-level serialisation concern out of llm-core while giving it an independent package boundary and qualification surface.

### Protocols and adapters

The v2 work has also expanded and tightened several integration surfaces, including A2A, stateless MCP, external-contract handling and AI SDK integration.

These are being developed as part of the `2.0.0` architecture rather than released incrementally under temporary v2 versions.

### Evidence ledger

The controlled classifications below are deliberately narrower than ordinary release prose:

- `public-release` means registry publication is evidenced.
- `tagged-release` means an exact Git tag exists, but publication is not inferred from the tag alone.
- `development-milestone` records an important source boundary without claiming that it was independently releasable.
- `release-candidate` means qualification evidence exists, but publication has not occurred.

Implemented, qualified, published and supported are independent states. A commit subject containing words such as “release” or “publish” does not change those evidence states.

| Milestone | Exact source boundary and commit date | Classification | Evidence state and disposition |
| --- | --- | --- | --- |
| Published rewrite anchor, `1.21.5` | `fa082297aefcf45890df145e8ec4565ded75180e`, `2026-01-27T09:10:40+08:00` | `public-release` | Implemented and published. npm publication is evidenced; current support is not inferred from age alone. |
| Monorepo migration | `49a188b7ee6d198c4efc298683ed2e3def24e1fd`, `2026-01-28T08:03:06+08:00` | `development-milestone` | Implemented, not a distinct package version. Historical-only. |
| Architecture v2 P0 convergence | `4640a1fd7351c54bf965513cdfdfde53edce1825` through `e72d312e3f9d966acc2b96548c42b122498b3315`, `2026-07-29T16:04:48+08:00` to `2026-07-30T03:43:39+08:00` | `development-milestone` | Major replacement architecture implemented. Not a release and later corrected by ADR-016 and ADR-017. |
| Documentation freeze tag | Annotated tag object `b89665708ffa5a6bbedb150965ee7ea7df845e9e`, peeled commit `7a24d4307e27ce192638b2f124da66e8a9d54477`, `2026-07-30T01:25:58+08:00` | `development-milestone` | Documentation freeze only. It is not a package or version tag. |
| Architecture v2 kernel completion | `9920425b37ac8e83d94dcd1caad171e03113f34c`, `2026-08-01T20:58:15+08:00` | `development-milestone` | Kernel completion is supported by architecture authority and then-current package evidence. It is not the final v2 public surface. |
| Post-kernel receipt and reproducible qualification | `bb7f7f7defa2f55be5ee102d6522adbdd579df0c` through `059f3e5c387eee5991d433b4e6c1e2feae18a691`, `2026-08-02T18:28:31+08:00` to `2026-08-04T01:07:10+08:00` | `development-milestone` | Receipt reconciliation and a canonical release gate were implemented. A gate existing in the tree is not itself a publication receipt. |
| Runtime ownership correction | `b9ed74662ad3944e8abcc6fec8d14191dd4420cb`, `2026-08-04T02:39:24+08:00` | `development-milestone` | ADR-016 narrowed wrongly public runnable ownership. Historical-only within the unpublished v2 line. |
| strict-json extraction and correction | Extraction `5535686741f0d21cd8ccf06a7443043c5f648bf8`, `2026-08-06T22:10:42+08:00`; key-order correction `83ed374135b6cd79ff6b90f25219da5806909649`, `2026-08-08T16:22:04+08:00`; frozen boundary `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93` | `release-candidate` for strict-json | `0.1.0` is technically qualified at the frozen boundary. Human lifecycle closure and npm publication remain outstanding. |
| Exact external-contract authority and runtime correction | `4c8cd971e73e2428d08cec3d219508b7bfdf5515` through `f02e3f8c963312357493626a89fce3b4d915a050`, `2026-08-07T22:13:12+08:00` to `2026-08-08T12:06:22+08:00` | `development-milestone` | ADR-017 authority and runtime operations were corrected. Specification and provider corrections were still outstanding at this boundary. |
| Qualified A2A and stateless MCP boundary | `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93`, `2026-08-09T12:43:06+08:00` | `release-candidate` for those surfaces | Exact A2A 1.0 and stateless MCP qualification existed, but whole-package publication remained blocked. The commit subject is not publication evidence. |
| Current combined v2 candidate | Uncommitted working tree after `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93` | `release-candidate` | Exact specification operations, the AI SDK native-response contract and retry-safe release provenance now pass the canonical local qualifier. This state has no source SHA, tag, registry archive or support receipt yet. |

The eventual `2.0.0` `sourceSha` must be the reviewed commit containing the current exact-contract corrections. It must not be backfilled as `ac788c7`. A later release commit may add only approved metadata, archive the change fragments and bind the release plan.

## Current v2 status

The next llm-core release is version `2.0.0`.

It has not been published yet.

The architecture and final public-contract corrections are implemented and the combined local canonical qualifier passes. The remaining work is human review, strict-json lifecycle closure and publication, durable source and release commits, dated metadata, and hosted publication evidence for the exact archives.

One of the more important changes in the v2 release process is that the archive being qualified is intended to be the same archive that gets published.

Until `2.0.0` ships, the latest published npm version remains:

```text
@geekist/llm-core@1.21.5
```

The current manifest names `@aifsd/llm-core@2.0.0`. It is a release candidate, not release history or a pin-ready coordinate until publication evidence exists.

## Release provenance

There is a more detailed provenance record behind this document.

That exists because repository history, tags, manifests, changelogs, CI outputs and registry state can diverge over time.

For historical releases, package manifests, annotated tags and registry state are therefore treated as stronger anchors than reconstructed assumptions.

Going forward, the release model is straightforward:

1. qualify the exact archive intended for publication;
2. record the source, manifests, lockfile, toolchain and release inputs that produced it;
3. publish that exact archive without rebuilding it; and
4. record the resulting tag, registry integrity, GitHub release and provenance information.

The goal is simple: a published package should be the same package that was actually qualified.
