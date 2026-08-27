---
id: production-quality-gates
title: Establish production code-quality gates
stage: qualification
status: done
priority: critical
forward_to: []
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - .prettierignore
  - .eslintrc.cjs
  - .eslintignore
  - eslint.config.js
  - .github/workflows/ci.yml
  - .github/workflows/codeql.yml
  - .github/workflows/docs.yml
  - .github/workflows/release.yml
  - .github/quality-gates.json
  - packages/llm-core/tsconfig.eslint.json
  - packages/aifsd/tsconfig.eslint.json
  - packages/strict-json/tsconfig.eslint.json
  - scripts/quality/**
  - scripts/qualify-release.ts
  - scripts/qualify-release.test.ts
  - scripts/release-provenance-receipt.ts
  - scripts/release-provenance.test.ts
  - scripts/release-history/release-controller.ts
  - scripts/release-history/release-controller.test.ts
  - scripts/release-history/bounded-response.ts
  - scripts/release-history/bounded-response.test.ts
  - scripts/release-history/reconcile-receipt-asset.ts
  - scripts/release-history/reconcile-receipt-asset.test.ts
  - scripts/release-history/release-live-authority.ts
  - scripts/release-history/release-live-authority.test.ts
  - scripts/release-history/prepare-artifact.test.ts
  - scripts/release-history/resolve-release-artifact.mjs
  - scripts/release-history/resolve-release-artifact.test.ts
  - scripts/download-published-package.ts
  - scripts/download-published-package.test.ts
  - scripts/check-sloc.ts
  - scripts/check-sloc.test.ts
  - scripts/sloc-baseline.json
  - docs/snippets/v2/control-policy.ts
  - examples/agentic/README.md
  - examples/kitchen-sink/README.md
  - packages/aifsd/tests/fixtures/integrations/openhands/README.md
  - packages/aifsd/tests/fixtures/integrations/pydantic-ai/README.md
  - packages/llm-core/docs/internal/QUALITY-GATES.md
  - packages/llm-core/docs/final-architecture/tasks/production-quality-gates.md
required_reading:
  - path: eslint.config.js
    reason: Preserve the qualified lint policy and intentional task-specific exceptions at the replacement flat-config boundary.
  - path: .github/workflows/ci.yml
    reason: Preserve canonical release qualification, exact PydanticAI conformance and SonarQube analysis while strengthening enforcement.
  - path: .github/workflows/release.yml
    reason: Keep packed-release and publication evidence separate from pull-request quality and review admission.
  - path: package.json
    reason: Reconcile the current root scripts, dependency versions and package gates into one canonical quality command.
  - path: scripts/check-sloc.ts
    reason: Preserve the repository-owned roughly-500 target and 600-line hard boundary rather than replacing it with a generic lint limit.
read_scope:
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - .github/**
  - .eslintrc.cjs
  - eslint.config.js
  - package.json
  - bun.lock
  - scripts/**
  - scripts/check-sloc.ts
  - packages/*/package.json
  - packages/*/tsconfig*.json
  - packages/*/src/**
  - packages/*/tests/**
  - packages/llm-core/docs/internal/**
  - packages/llm-core/docs/final-architecture/**
  - sonar-project.properties
review_owner: coordinator
updated_at: 2026-08-24
---

# production-quality-gates — Establish production code-quality gates

## Objective

Provide one enforceable, reproducible quality boundary for llm-core, AIFSD and
the supporting workspace that combines modern linting, typed architectural
checks, deterministic qualification and external analysis. Independent semantic
review remains task evidence rather than a CI authority.

## Why this exists

The workspace still uses end-of-life ESLint 8 and legacy eslintrc configuration.
Its CI includes valuable SonarQube, exact PydanticAI and packed-release evidence,
but the repository has no checked-in CodeQL lane. WPKernel, Task Graph and
Simple Chat each contain
useful quality patterns, but their ESLint versions, debt profiles and package
boundaries are not authority for this workspace.

## Inputs

- The current llm-core/AIFSD dirty repair remains preserved and uncommitted.
- WPKernel contributes reference patterns for architectural imports and domain
  rules, not an ESLint version or copyable configuration.
- Task Graph contributes the non-regression ratchet and evidence model.
- Simple Chat contributes the clean-slate hard-gate profile where its tree is
  already green.

## In scope

- Replace legacy eslintrc with an ESLint 10 flat configuration after qualifying
  every plugin and configuration dependency.
- Add typed TypeScript linting for production boundaries without normalising
  `MaybePromise` code into always-async flows.
- Preserve hard architectural, SLOC, conformance and release checks while
  ratcheting inherited non-architectural debt.
- Provide one canonical `quality:check` command and pinned pull-request CI.
- Add CodeQL analysis while keeping semantic-review evidence in task handoffs.
- Document the expected GitHub ruleset and required checks separately from the
  checked-in workflow implementation.

## Out of scope

- Committing, pushing, publishing or changing live GitHub repository settings.
- Copying another repository's ESLint configuration wholesale.
- Creating a shared cross-repository ESLint package before identical rules have
  been demonstrated by usage.
- Refactoring production behaviour merely to satisfy stylistic rules.
- Replacing SonarQube, exact provider conformance or release qualification.

## Contract and naming constraints

- `quality:check` is the canonical local and CI entrypoint.
- Architecture/public-front violations and new suppressions are hard failures.
- Existing measurable style or complexity debt may be baselined but never
  increased; the intended final rule remains explicit.
- Roughly 500 physical lines is the design target and 600 is the hard boundary.
- External static analysis is not represented as independent semantic review.
- CI neither verifies nor manufactures GitHub approval.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

Existing dirty `package.json` and `bun.lock` hunks belong to the completed
uncommitted AIFSD/headless repair. This task may add only the quality dependency
and script changes required by its scope and must preserve every existing hunk.

## Acceptance criteria

- ESLint 10 flat config runs successfully with every installed plugin and no
  legacy compatibility loader.
- Production TypeScript receives type-aware linting through project service or
  an equivalently explicit project boundary.
- Existing architectural public-front checks, exact PydanticAI conformance,
  SonarQube analysis, SLOC policy and package/release qualification remain
  reachable and semantically unchanged.
- One `quality:check` command covers format, lint, structural checks, types,
  deterministic tests, coverage and production/package build evidence without
  duplicating release-only external qualification.
- Pull-request CI uses immutable action references and frozen dependencies.
- CodeQL runs through a pinned workflow and can be named as a required check.
- The expected GitHub ruleset names the exact checks that must protect `main`.
- No `MaybePromise` boundary becomes unconditionally asynchronous as a lint fix.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun install --frozen-lockfile
bun run quality:check
bun run release:qualify:llm-core
git diff --check
```

## Required evidence

- ESLint 10 and plugin compatibility matrix.
- Intentional differences from Task Graph, Simple Chat and WPKernel.
- Changed file list and exact dirty-hunk preservation statement.
- Verification commands, exit statuses and concise results.
- Independent reviewer findings against the final task-scoped diff.
- Live GitHub ruleset state recorded separately from checked-in readiness.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

Execution mode: shared-checkout
Execution rationale: The quality files are repository-level and the current dirty repair must be qualified in its real canonical checkout.
Concurrency evaluation: uncommitted AIFSD/headless repair and native-agent-runtime-governance-reconciliation; start alongside with exact hunk preservation because the repair and governance task own disjoint implementation and architecture paths.
Concurrent task scopes: uncommitted AIFSD/headless repair owns all existing dirty implementation, test, package-manifest and lockfile hunks; native-agent-runtime-governance-reconciliation owns ADR-018, its eight proposed downstream briefs, the decision index and STATUS.
Swarm delegation: codex/root -> codex/quality_security_review: read-only security and final-diff review; independent findings with no write authority.

2026-08-23: Final integration serialised whole-file ownership of `package.json`,
`bun.lock` and `packages/llm-core/package.json` to the active AIFSD headless
receiving task. Those files contain inseparable headless adoption and quality
tooling hunks. This task retains read and qualification authority, while the
headless task's fresh expanded review owns their complete final diffs.

2026-08-22: Qualified the shared ESLint 10 dependency matrix against Task Graph
and Simple Chat. Replaced the legacy eslintrc boundary with typed production
projects and an untyped test/tooling lane. The full workspace project service
was rejected after exhausting Node's 4 GB heap because package tsconfigs admit
1,110 test files; three explicit production-only projects preserve the intended
semantic boundary without weakening production lint.

2026-08-22: Established an initial non-increasing baseline of 306 warnings and 96
existing suppressions. Architecture, public fronts, 600-line production limit,
unused values, parameter boundaries and fallthrough remain hard failures.
MaybePromise-sensitive `require-await` and Sonar's incompatible function-return
rule remain disabled. Deterministic alphabetical ordering remains permitted.

2026-08-22: An earlier candidate added pinned CI, CodeQL and an exact-diff
independent-review verifier. That verifier and its ruleset expectation were
subsequently retired by the 2026-08-24 correction below and are not part of the
current implementation.

2026-08-22: Full coverage exposed an adjacent headless-workbench test fixture
resolving the repository manifest relative to process cwd. Its focused repair
is 8/8 green. The ordinary cross-platform coverage suite excludes the separate
macOS OpenHands exact-runtime qualifier; an explicit host run remains
fail-closed and currently times out after 60 seconds in its sandbox.

2026-08-23: Independent security review rejected generic GitHub Actions check
projection as an authority boundary because trusted and candidate workflows
share the same producer App identity. The provisional read-only evidence
workflow and dedicated-App activation proposal were subsequently retired by
the 2026-08-24 correction below.

2026-08-23: The provisional design used a reviewer-authored JSON envelope and
GitHub review metadata. That design was never activated and was removed by the
2026-08-24 correction below.

2026-08-24: The GitHub exact-diff approval verifier, required-check expectation
and dedicated-App activation plan were retired. They were an invented
deployment authority, not the intended process. Independent semantic review is
task evidence, CodeRabbit is the external pull-request reviewer, and the
repository owner may review, merge or close directly.

2026-08-24: The separately committed documentation/governance update moved the
quality candidate's real Git base to `757dc5f07ef263e21c77b51d56e0f177dddbc9cc`.
The one-time lint and coverage bootstrap predicates now bind that exact base;
the ESLint bootstrap additionally binds the exact observed candidate digest.

## Blocker

The separately owned native-agent governance reconciliation is locally accepted
and must be received with this task so STATUS remains reproducible from the
committed task sources. There is no external review-check activation blocker.

2026-08-23: Focused quality-policy qualification is green with 13 tests and 19
expectations. The GitHub policy verifier accepts only immutable action SHAs,
detects both step-level YAML `uses` forms, forbids generic Actions check
projection and, in that earlier candidate, kept an external App contract
blocked. That App proposal was retired by the 2026-08-24 correction. Full ESLint 10
qualification was green at the then-current 306-warning and 96-suppression
ratchets. The task remains claimed until final canonical qualification and
review complete.

2026-08-23: Independent ADR review found ADR-018 directionally sound but not
acceptable unchanged. It conflicts with ADR-017 native-contract preservation,
omits explicit active-input admission authority and gives the Task Graph
migration brief no read authority for its required source. ADR revision and
acceptance remain a separate governance change; this task does not weaken the
architecture validator or silently accept the proposal.

2026-08-23: Cross-repository semantic review exposed location-free debt
ratchets and prematurely broad release permissions as shared failure modes.
The ESLint baseline is now version 2: warnings bind exact file, location,
diagnostic and source line, while suppressions bind location and the complete
containing-file digest. Three adversarial anchor tests prove movement,
expansion and duplication fail. The SLOC gate now rejects a package source
whose hard-boundary follow-up belongs to another package; 46 focused SLOC tests
and the 597-module repository gate are green.

2026-08-23: Coverage compares exact hit/found ratios by cross multiplication
and includes a regression hidden by two-decimal display rounding. The earlier
candidate also experimented with a read-only review-evidence verifier; that
provisional machinery was retired by the 2026-08-24 correction.

2026-08-24: Release publication remains one tagged workflow. The candidate
`workflow_run` publisher and its transfer/verifier policy were removed because
they duplicated the qualified pack, registry reconciliation and trusted
publishing path without improving the owner-controlled release model.

2026-08-23: The final lint ratchet contains 302 warnings and 96 suppressions.
Candidate anchors must equal observed ESLint debt, use positive safe-integer
counts and remain a subset of the trusted Git baseline. Coverage uses the same
PR-base or push-before authority, validates exact count schemas before ratio
comparison and rejects zero-denominator baselines. The one-time lint and
coverage bootstraps are sealed to the task base and exact reviewed file digests.

2026-08-23: Hard-boundary SLOC follow-ups now require both same-package
ownership and a canonical `write_scope` covering the exact waived source.
SonarQube and Codecov credentials were removed from pull-request execution and
are main-push-only evidence. SonarQube is therefore no longer claimed as a PR
required check.

2026-08-24: The minimal release path uses one version/tag and one tagged
workflow for package qualification, pack-once npm OIDC publication, exact
registry byte/integrity reconciliation, provenance receipt and GitHub release
projection. Actions remain immutable SHA pins. CodeRabbit review and owner
merge or close authority remain pull-request process, not release jobs.

2026-08-24: Final release review added four bounded retry and authority guards.
Publication now re-reads the live remote tag and main containment immediately
before npm, registry reconciliation includes exact SHA-1 shasum and derived
dist-tag checks, evidence names survive failed-job reruns, and receipt upload is
idempotent only when an existing asset preserves the same stable publication facts.

2026-08-24: The direct sharp-edge audit removed release-plan and
`approvedMetadataPaths` ceremony from tagged workflow admission. Tagged phases
now bind the package manifest version directly to the tag, checked-out HEAD,
`GITHUB_SHA`, live remote tag and live main. Registry, dependency and
attestation downloads use bounded streaming reads with timeouts; process
helpers use explicit timeout and output caps. Included DSSE subject and
certificate parsing is described only as provenance identity inspection, not
cryptographic signature verification.

## Handoff

### Result

Implementation and local qualification are complete. The candidate is ready for
a coordinated commit with the separately reviewed governance reconciliation so
the generated architecture STATUS remains reproducible. Publication activation
remains explicitly external.

### Decisions applied

- ESLint debt is exact, source-bound and non-increasing against the trusted Git
  base; the one-time bootstrap is sealed to this task's base and reviewed digest.
- Coverage uses strict count schemas and exact ratios against the trusted Git
  base; Bun branch counters remain truthfully unavailable.
- Candidate-controlled pull-request workflows receive no SonarQube or Codecov
  credentials.
- Tag qualification, npm OIDC publication, registry reconciliation and GitHub
  release projection run in one minimal tagged workflow.
- Independent semantic review remains task evidence and is not projected as a
  GitHub required check.

### Files changed

ESLint 10 flat configuration and explicit production tsconfigs; canonical
quality runner and policy/baseline tests; immutable CI and CodeQL workflows;
checked-in GitHub policy; one tagged release workflow, qualifier, provenance
receipt and release controller; SLOC policy and
baseline; package manifests, lockfile and quality documentation. Exact paths are
the task `write_scope` above.

### Verification evidence

- `bun run quality:lint`: ESLint 10.9.0 passed with 301 anchored warnings and
  96 digest-bound suppressions against the exact current bootstrap base.
- GitHub policy: 4 workflows, immutable action references and 3 active checks;
  pass. No independent-review check or approval expectation remains.
- Release authority and GitHub policy: 51 focused tests and 322 assertions pass;
  final bounded security review found no actionable defect after the atomic
  publish/reconcile repair.
- SLOC: 609 source modules checked at the 500-line target and 600-line hard
  limit; pass.
- `bun run quality:check`: 1,395 tests passed, 7 skipped, 0 failed and 5,832
  assertions; coverage passed at 86.6% lines and 91.27% functions; all three
  production package builds passed under Node 24.13.
- Node 24.13 packed-package smoke checks passed for strict-json, llm-core and
  AIFSD; llm-core verified 35 ESM-only ADR-016 exports from isolated runtime and
  declaration consumers.
- Independent final review found no remaining actionable findings.
- `git diff --check`: pass.

### Deviations

- SonarQube and Codecov are main-push evidence rather than PR checks because
  their service credentials cannot be exposed to candidate workflow YAML.
- npm provenance handling inspects subject and included certificate identity;
  it does not cryptographically verify the DSSE signature or certificate chain.
- llm-core retains reviewed coordinator SLOC waivers rather than TaskGraph's
  strict structural non-increase profile.

### Remaining risks

- Configure each npm package trusted publisher for exact workflow
  `release.yml` and action `npm publish`.
- Until that configuration passes, live publication through the route is not claimed.

### Recommended next task

Receive `native-agent-runtime-governance-reconciliation` with this task's source
present, regenerate STATUS from the committed set, then separately authorise the
external GitHub and npm activation work.
