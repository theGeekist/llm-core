---
id: release-history-provenance
title: Reconstruct release history and preserve publication provenance
stage: qualification
status: done
priority: critical
forward_to: []
depends_on:
  - release-v2-readiness
decision_dependencies:
  - ADR-007
  - ADR-015
conflicts_with: []
write_scope:
  - .github/workflows/release-history.yml
  - .github/workflows/release.yml
  - CHANGELOG.md
  - package.json
  - bun.lock
  - packages/aifsd/CHANGELOG.md
  - packages/aifsd/README.md
  - packages/aifsd/package.json
  - packages/aifsd/scripts/**
  - packages/aifsd/changes/**
  - packages/aifsd/releases/**
  - packages/aifsd/src/**
  - packages/aifsd/tests/**
  - packages/aifsd/docs/final-architecture/tasks/configuration-manifest-characterization.md
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/product/aifsd/docs/final-architecture/tasks/configuration-manifest-characterization.md
  - packages/llm-core/CHANGELOG.md
  - packages/llm-core/README.md
  - packages/llm-core/package.json
  - packages/llm-core/changes/**
  - packages/llm-core/releases/**
  - packages/strict-json/CHANGELOG.md
  - packages/strict-json/README.md
  - packages/strict-json/package.json
  - packages/strict-json/changes/**
  - packages/strict-json/releases/**
  - docs/reference/releases.md
  - docs/reference/release-history.md
  - scripts/release-history/**
  - scripts/release-history.test.ts
  - scripts/download-published-package.ts
  - scripts/download-published-package.test.ts
  - scripts/release-provenance.ts
  - scripts/release-provenance-receipt.ts
  - scripts/release-provenance.test.ts
  - packages/llm-core/docs/final-architecture/tasks/release-history-provenance.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/tasks/release-v2-readiness.md
    reason: Preserve the completed Turbo and publication-gate work as the execution foundation rather than duplicating it.
  - path: packages/llm-core/docs/final-architecture/PLAN.md
    reason: Reconstruct completed v2 kernel milestones from architecture authority rather than commit messages alone.
  - path: docs/reference/conformance.md
    reason: Preserve the distinction between implementation, qualification, publication and supported evidence.
read_scope:
  - packages/llm-core/docs/final-architecture/tasks/release-v2-readiness.md
  - packages/llm-core/docs/final-architecture/PLAN.md
  - docs/reference/conformance.md
  - .github/workflows/**
  - .git/**
  - CHANGELOG.md
  - README.md
  - package.json
  - packages/*/CHANGELOG.md
  - packages/*/README.md
  - packages/*/package.json
  - packages/*/changes/**
  - packages/*/releases/**
  - packages/llm-core/docs/final-architecture/**
  - packages/strict-json/docs/**
  - docs/reference/**
  - scripts/**
  - /Users/jasonnathan/Repos/@pipewrk/llm-core/**
  - context/simple-chat/**
review_owner: coordinator
updated_at: 2026-08-10
---

# release-history-provenance: Reconstruct release history and preserve publication provenance

## Objective

Produce an evidence-backed 1.x and v2 release ledger, publish one current
pin-ready llm-core version, and make every future release traceable from
development intent through qualified archive to registry artefact without
blocking unrelated package or Simple Chat development.

## Why this exists

The public repository contains a substantial architectural and implementation
history that is not represented by its current tags, changelogs or releases.
Simple Chat also needs a real current llm-core version to pin. Reconstructing
that history must preserve authorship and collaboration, distinguish meaningful
milestones from publishable artefacts, and avoid inventing versions, dates or
support claims.

## Inputs

- Git commits, trees, tags and existing GitHub or npm release evidence from the
  first 1.x publication through the selected current release boundary.
- Package task front matter, architecture plans, ADRs, work logs and durable
  qualification records from llm-core and strict-json.
- The completed `release-v2-readiness` Turbo graph, package changelogs and
  guarded publication workflow.
- The historical `@pipewrk/llm-core` checkout as read-only evidence for 1.x
  scripts, changelog lineage and releases.
- Simple Chat's declared llm-core dependency requirements as downstream
  pinning evidence, not as authority to fabricate an upstream version.

## In scope

- Freeze and record an explicit source boundary so historical reconstruction
  proceeds independently while later development continues.
- Reconstruct 1.x as well as v2 from Git, package documents and published
  evidence, retaining gaps and confidence levels where proof is incomplete.
- Classify candidate points as development milestones, release-capable states,
  historical-only states or the current release.
- Derive the current package version from actual SemVer impact and public
  lineage, qualify it, and produce a version Simple Chat can pin.
- Define schema-versioned change fragments and committed release records for
  machine-verifiable and human-readable provenance.
- Add a trusted exact-SHA historical release controller with dry-run,
  qualification, archive digest and post-publication verification gates.
- Publish development-history material that preserves task, decision,
  authorship and AI-assisted collaboration provenance honestly.

## Out of scope

- Inventing npm prereleases, publication dates, authorship, support windows or
  milestone boundaries for cosmetic continuity.
- Rewriting historical commits, commit dates, authors or existing tags.
- Publishing Simple Chat or changing its release process.
- Folding unrelated application development into the llm-core release task.
- Replacing or weakening the canonical `release:qualify:llm-core` gate.

## Contract and naming constraints

- `release:qualify:llm-core` remains the only npm-publication gate and uses the
  Turbo execution graph owned by `release-v2-readiness`.
- A release record distinguishes historical `sourceSha` from a metadata-only
  `releaseSha`; when they differ, validation proves that only approved release
  metadata changed.
- GitHub development milestones may identify historically important states.
  npm publication is permitted only for coherent, uniquely versioned and fully
  qualified package artefacts.
- Release preparation generates version, changelog and provenance material
  before qualification. Publication consumes the qualified archive without
  rebuilding or mutating source.
- Change fragments are package-owned and require a fragment or a versioned
  no-release-note rationale for public or release-affecting changes.
- Human collaboration records use factual acknowledgement fields and never
  misrepresent an AI system as a conventional Git author.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- An inspectable ledger accounts for every existing 1.x tag/release and every
  material v2 milestone through the recorded source boundary, with source
  commits, package impact, task/ADR evidence and confidence or gap notes.
- The current llm-core version follows from actual SemVer evidence, passes the
  complete canonical qualifier, is published through the guarded workflow and
  can be pinned exactly by Simple Chat.
- Historical GitHub releases use reachable exact SHAs. Historical npm releases
  are created only where exact manifests, dependency graph, changelog and
  qualification evidence make them supportable.
- Every generated release record binds package, version, source SHA, release
  SHA, tree, tag, manifest and lock digests, toolchain, qualifier registry,
  archive digest, workflow run and registry integrity or attestation.
- A required change-fragment or explicit no-release-note rule is validated in
  CI, and released fragments remain recoverable after changelog generation.
- A post-publication verifier proves that the downloaded npm artefact matches
  the qualified archive and that tag, GitHub release and registry metadata
  agree.
- The reconstruction workflow is read-only over historical source and can run
  while disjoint application development continues.
- New or materially changed hand-written source/test modules target roughly
  500 lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test scripts/release-history.test.ts scripts/release-provenance.test.ts
bun run release:history:validate
bun run release:provenance:validate
bun run release:version:check
bun run release:qualify:llm-core
git diff --check
```

## Required evidence

- A 1.x and v2 ledger with evidence source, confidence and unresolved gaps.
- A milestone classification reviewed before any historical tag or release is
  created.
- The selected current version rationale and Simple Chat pin target.
- Dry-run evidence for GitHub-only milestones and npm-capable releases.
- Qualified archive contents, digest and post-publication comparison.
- Changed file list, verification results and remaining known loss.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

- Claim: `codex-root` began evidence reconstruction from
  `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93` with a lease through
  `2026-08-11T23:26:59+08:00`.
- Execution mode: shared-checkout.
- Execution rationale: the work is primarily historical analysis and
  package-owned release metadata; implementation will retain one writer per
  file and does not require a branch or separate application checkout.
- Concurrency evaluation: none; start independently because no task is active
  and downstream Simple Chat development is outside this task's write scope.
- Concurrent task scopes: none.
- Swarm delegation: `codex-root -> release_1x_lineage`: reconstruct read-only
  1.x tag, changelog and release evidence; `codex-root -> release_v2_ledger`:
  correlate v2 commits with package tasks, ADRs and SemVer impact;
  `codex-root -> provenance_contract`: review the current qualifier and propose
  change-fragment, release-record and downstream pinning contracts. All child
  roles are evidence-only and have no write lease.
- Source boundary: reconstruction currently ends at
  `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93`; later commits enter future change
  fragments rather than silently changing the historical ledger.
- Provenance design finding: model one logical release record as a committed
  pre-tag `plan.json` plus a post-publication `receipt.json`. The plan resolves
  `releaseSha: "SELF"` against its containing commit and records intended
  inputs; the receipt binds future workflow, archive, registry and attestation
  facts after they exist. Release records remain outside the published package
  file inventory to avoid circular archive digests.
- Downstream finding: the mounted Simple Chat snapshot at
  `25108aa4acfc4cc036dddc15cd8a3e132aecdf5e` has no existing llm-core
  dependency or honest pin location. This task may establish a published
  pin-ready coordinate; the importing Simple Chat package must own the eventual
  exact dependency, lock integrity and consumer verification evidence.
- 1.x reconstruction: identified two independent package histories. The legacy
  `@jasonnathan/llm-core` repository has 33 annotated tag anchors from `v1.0.0`
  through `v1.9.1`; canonical `@geekist/llm-core` is a separate rewrite whose
  Stage 0-21 changelog headings mostly describe development milestones rather
  than manifest versions. Canonical `v1.21.1` is anomalous because its tag
  target contains manifest version `1.21.0`.
- v2 reconstruction: retained `9920425` as the architecture kernel milestone,
  later qualification and ownership corrections as development milestones,
  and `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93` as the current release source
  candidate. The future coordinate is `@geekist/llm-core@2.0.0`, after its exact
  `@aifsd/strict-json@0.1.0` dependency is governed and published.
- Release blockers: strict-json is unpublished and its foundation lifecycle is
  unresolved; both changelogs remain undated; release tooling is uncommitted;
  and the coordinator must decide whether the critical exact-operation
  specification correction blocks `2.0.0` or narrows its claimed surface.
- Evidence artefact: added `docs/reference/release-history.md` with the initial
  1.x/v2 ledger, confidence boundaries, anomalies, current pin target and
  forward provenance contract.
- Registry verification: a direct npm query on 9 August 2026 observed canonical
  versions `1.21.0`, `1.21.2`, `1.21.3`, `1.21.4` and `1.21.5`, with `1.21.5`
  as `latest`; `1.21.1` is absent and `@geekist/strict-json` returns `E404`.
  The ledger therefore distinguishes the latest currently pinnable `1.21.5`
  from the honest next v2 release target `2.0.0`.
- Review correction: normalised milestone classification and separated
  implemented, qualified, published and supported evidence. Reclassified
  legacy tags as publication-unknown, strict-json extraction as implementation
  only, split mixed v2 commit ranges and added the `docs-v2-p0-freeze` tag.
- Provenance implementation: added closed strict-JSON validation for
  package-owned pending/released change fragments, two-phase release plans and
  post-publication receipts. The initial llm-core and strict-json fragments
  preserve task, decision, SemVer, contributor and factual AI-assistance
  provenance without requiring a fragment to predict its containing commit.
- Exact-archive implementation: release workflows now stage one `npm pack`
  archive, record its SHA-512 and canonical inventory digest, smoke-test that
  exact tarball, upload the archive and metadata as workflow evidence, and pass
  the same path to `npm publish --provenance`. Both package smoke consumers
  accept an explicit tarball while retaining their existing fresh-pack mode.
- Focused verification: provenance and artefact suites passed 10 tests with 20
  assertions; focused ESLint and repository provenance validation passed. A
  real strict-json 0.1.0 archive was packed, digested and consumed successfully
  through the new supplied-tarball path. The llm-core 2.0.0 archive was packed
  and digested, but its supplied-tarball smoke stalled inside npm installation;
  that attempt is not recorded as consumed or passed.
- Strict-json boundary: `83ed374` fixed canonical record-key ordering missed
  at extraction; `ac788c7` is the technically qualified all-green source
  boundary. Human review is complete and explicitly includes that key-order
  erratum. A durable metadata-only release commit and provenance plan still
  must follow the reviewed source boundary before publication.
- V2 release boundary: current 2.0.0 publication is no-go while the public
  specification journey violates ADR-017 and the AI SDK native adapter
  correction remains critical. Either complete those exact-contract tasks or
  remove the affected public surfaces, claims, smoke expectations and docs;
  documentation-only qualification is forbidden.
- Canonical-gate integration: strengthened the release-entrypoint validator so
  tagged jobs must order version validation, source qualification, dependency
  registry checks, exact archive preparation, exact tarball smoke, evidence
  upload and publication of that same path. A regression test rejects any
  fallback to repacking the working directory. Provenance validation now runs
  inside the canonical version gate.
- Canonical qualification attempt: frozen install, version/provenance checks,
  all 13 package checks, repository governance and the dependency build passed.
  The fresh llm-core packed-consumer `npm install` then produced no output for
  more than seven minutes. A process check confirmed it remained inside npm;
  the run was interrupted and is not reported as passed. An earlier orphaned
  smoke install from exact-archive testing was identified and terminated
  separately before the canonical run was stopped.
- Final focused verification: 37 release, fixture, version, provenance and
  artefact tests passed with 55 assertions; focused ESLint, formatting,
  version/provenance validation, task planning and `git diff --check` passed.
- Independent release review found optional plans, underconstrained nested
  evidence, local working-tree publication, workspace substitution for the
  published strict-json dependency, non-recoverable partial publication and no
  explicit prerelease dist-tag policy.
- Review correction: tagged publication now requires a Git-validated plan;
  closed plan and receipt schemas bind exact paths, digests and identities; a
  single controller reconciles registry state by archive bytes, integrity and
  `gitHead`; core smoke downloads published strict-json; post-publication
  verification writes a receipt; working-tree publication is absent; and
  prereleases derive an explicit npm channel.
- Size waiver: `scripts/release-history/release-controller.ts` and
  `scripts/release-provenance.ts` are approximately 500 lines each.
- Exact-contract receiving integration: the ADR-017 specification operation
  replacement and AI SDK native-response correction are implemented in review.
  The packed consumer exercises the replacement specification factory and the
  AI SDK adoption snippet requires an application-owned redaction and
  observation contract.
- Combined qualification on 2026-08-10: the canonical
  `bun run release:qualify:llm-core` gate passed outside the network-restricted
  sandbox. Frozen installation, provenance/version validation, 13 package
  checks, repository governance, the ordered build, the isolated 29-export
  packed consumer, external A2A/MCP fixtures and their registered qualifiers
  all passed. The package suite contained 718 passing tests, four intentional
  exact-authority skips and 2,543 assertions.
- Source-boundary correction: `ac788c7` remains the last committed historical
  candidate, not the eventual 2.0.0 `sourceSha`. The exact specification, AI
  SDK and release-controller corrections are currently uncommitted; their
  reviewed implementation commit must become the source boundary before a
  later metadata-only release commit and plan are created.
- Package-family correction: future candidates use the ordered publication
  topology `@aifsd/strict-json@0.1.0` -> `@geekist/llm-core@2.0.0` ->
  `@aifsd/sdk@0.1.0`; `@wpkernel/pipeline@1.4.0` remains an exact external
  dependency. The llm-core v2 candidate intentionally retains the same
  `@geekist/llm-core` coordinate as the independently reconstructed 1.x line;
  ledger entries distinguish published releases from the unpublished candidate.
- AIFSD candidate boundary: the first SDK release is limited to the
  characterised `./config` and `./integrations` fronts. Exact archive smoke
  proves both fronts in clean Node and NodeNext consumers and fails if the
  host-only qualification or trust declarations escape the package.
- Three-package implementation: executable identities, workspace imports,
  build externals, packed consumers and lockfile resolution now use
  `@aifsd/strict-json`, `@geekist/llm-core` and `@aifsd/sdk`. The controller,
  version and provenance validators accept the AIFSD package key and
  `aifsd-v*` tag family while retaining mandatory plans, retry-safe registry
  reconciliation and post-publication receipts for all three packages.
- Registry dependency implementation: a closed downloader verifies exact npm
  integrity before writing strict-json, llm-core or Pipeline archives. A
  property suite proves arbitrary archive bytes validate only against their
  own SHA-512 integrity and rejects changed bytes under the original record.
- AIFSD receiving evidence: the package release gate passed 306 tests with
  1,043 assertions, lint, TypeScript, formatting and build/declaration emit.
  The exact-archive smoke installed one SDK tarball with exact llm-core,
  strict-json and Pipeline tarballs into a clean consumer, loaded both public
  fronts under Node, typechecked them under NodeNext and proved host-only
  declarations remained absent.
- Authority reconciliation: removed the stale final paragraph from the
  completed AIFSD configuration task. Its handoff now agrees with human
  acceptance of `fcd38e263f7f5358f51fbde95a5af6d39e64f6fc` instead of claiming
  that an uncommitted repair remains in progress.
- Publication safety: no current release plan or receipt was created because
  the combined candidate has no durable reviewed source SHA. No commit, tag,
  push or npm publication was performed.

## Blocker

Human review of strict-json is complete at the final `ac788c7` boundary,
including the `83ed374` key-order erratum. The combined worktree still requires
a durable reviewed source commit before any release plan can truthfully exist.
Publication must then proceed in strict-json, llm-core and AIFSD dependency
order, with each downstream package consuming the exact registry archives of
its published dependencies.

## Handoff

### Result

Implementation and local receiving qualification complete; human review,
durable source/release commits and publication evidence remain outstanding.

### Decisions applied

- Preserve 1.x and v2 rather than treating v1.21.5 only as a starting marker.
- Keep historical narrative, current publication and future provenance as one
  traceable contract with distinct evidence types.
- Prioritise a qualified current version for downstream pinning without
  fabricating intermediate releases.

### Files changed

- Task record only at claim time.

### Verification evidence

- Canonical `bun run release:qualify:llm-core`: passed on 2026-08-10.
- Package `release:build`: 727 passed, four intentional skips, zero failed.
- Exact packed consumer: 29 ESM exports plus declarations and replacement
  specification-operation runtime factory passed outside the restricted
  sandbox.
- Release/provenance focused suite: 42 passed with 269 expectations.
- `@aifsd/strict-json@0.1.0` and `@aifsd/sdk@0.1.0` independent release
  qualifications passed, including exact packed runtime and NodeNext
  declaration consumers.
- SLOC, documentation, formatting and `git diff --check`: passed.
- Independent receiving reviews approved the specification, AI SDK and
  three-package release topology corrections.

### Deviations

- None.

### Remaining risks

- Historical npm and GitHub metadata may contain gaps that cannot be recovered
  from Git alone; those gaps will be recorded rather than inferred as fact.

### Recommended next task

- Commit the durable source boundary, then perform metadata-only release
  preparation and the guarded manual dry run. Publication remains a separate
  authorised operation.
