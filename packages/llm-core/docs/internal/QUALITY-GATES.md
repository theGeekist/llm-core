# Quality gates

`bun run quality:check` is the canonical local and pull-request quality
boundary. It composes formatting, ESLint, checked-in GitHub policy, public
boundaries, contract schemas, TypeScript, documentation, SLOC, deterministic
tests, coverage and production builds. Release qualification and provider
conformance remain separately named evidence because they prove different
things.

## Qualified toolchain

| Component                | Version | Qualification                             |
| ------------------------ | ------: | ----------------------------------------- |
| ESLint                   |  10.9.0 | shared qualified version                  |
| `@eslint/js`             |  10.0.1 | shared qualified version                  |
| typescript-eslint        |  8.67.0 | ESLint 10 and TypeScript 6 compatible     |
| SonarJS                  |   4.2.0 | selected high-signal rules                |
| Unicorn                  |  73.0.0 | selected high-signal rules                |
| `eslint-config-prettier` |  10.1.8 | flat-config terminator                    |
| globals                  | 17.11.0 | explicit host globals                     |
| TypeScript               |   6.0.2 | within typescript-eslint's declared range |

Simple Chat additionally uses import-x 4.17.1 and its TypeScript resolver 4.4.5
because it replaced `eslint-plugin-import`, whose peer range ends at ESLint 9.
llm-core did not use that incompatible plugin, so adding import-x here would add
policy without a demonstrated repository need.

## Cross-repository contract

Simple Chat is the clean-slate reference. It has no inherited lint debt, so
production warnings and suppressions fail immediately, its production modules
remain below 300 lines, and it enforces 95 per cent coverage floors.

Task Graph is the mature authority reference. It uses a typed production lane,
fast untyped tests and tooling, and exact non-increasing warning, suppression
and structural ratchets. Semantic review remains local task evidence in both
repositories; neither repository projects it as a GitHub approval authority.

llm-core retains the shared ESLint 10 matrix and evidence contract but does not
pretend to be clean-slate. The reviewed baseline currently contains 367
non-architectural warnings and 96 existing suppressions. Warnings are anchored
to exact file, location, diagnostic and source line. Suppressions are anchored
to their location and the complete containing-file digest, so relocation,
substitution or expansion beneath an inherited suppression requires explicit
baseline review. Architecture, public-front, unused-value, parameter,
fallthrough and 600-line production violations are hard errors.

The candidate baseline must exactly equal the debt observed by ESLint, including
the absence of stale or pre-authorised anchors. It must also be a subset of the
baseline read from the trusted Git revision. Local checks use the current
`HEAD`; pull-request CI uses the exact PR base, while main-push CI uses the
push-before commit. The one-time version-2 bootstrap is restricted to task base
`757dc5f07ef263e21c77b51d56e0f177dddbc9cc` and the independently reviewed
baseline digest embedded in the checker.

WPKernel's published Pipeline 2.0.0 pack-once, multi-runtime and exact registry
reconciliation lane is release-authority evidence. Its older ordinary CI,
mutable action tags and repository-specific lint configuration are not
authority for this workspace. The obsolete direct-upstream/manual-publish
prerelease route was separately quarantined at `a666580f`.

## Typed lint and functional semantics

Production TypeScript is checked against explicit production-only tsconfigs for
strict-json, llm-core and AIFSD. A whole-workspace project service was measured
and rejected after it exhausted a 4 GB Node heap while admitting 1,110 test
files. Tests and repository tooling use the fast untyped lane.

Rules that would force `MaybePromise` functions to become unconditionally
async are disabled. Sonar's function-return-type rule is also incompatible with
honest sync-or-async settlement. Alphabetical-sort warnings are disabled where
ordering is deterministic domain behaviour rather than presentation style.

The repository's physical SLOC checker remains authoritative: roughly 500
lines is the design target and 600 lines is the hard production boundary.
Hard-boundary waivers require an actionable follow-up task in the same package,
and that task's canonical `write_scope` must own the exact waived source.

## Coverage and external qualification

Line and function coverage are ratcheted from Bun's LCOV output. Bun 1.3.14
does not emit branch counters, so branch coverage is recorded as unavailable,
not manufactured as zero or full coverage. If Bun starts emitting branch
counters, the baseline must be deliberately refreshed and reviewed.

The coverage floor is also read from the trusted Git revision. A candidate may
raise it but cannot lower it, including through `--write-baseline`; the initial
coverage file is restricted to the same exact task base and its reviewed file
digest. Comparisons use exact hit/found cross multiplication rather than the
rounded percentage shown to humans.

The macOS OpenHands sandbox probe is an exact-runtime host qualification, not a
portable unit test. The canonical cross-platform coverage lane excludes that
directory. Its task-owned command must still be run with the frozen uv
environment when OpenHands support evidence is being qualified.

## Release authority

The tag-triggered `Release` workflow checks out without persisted credentials,
validates the exact package, tag and source identity, packs and qualifies one
archive, publishes that same archive through npm OIDC, reconciles registry
bytes, integrity, SHA-1 shasum and the derived dist-tag, verifies the live tag
and main containment plus provenance identity, then creates the GitHub release
and receipt. Failed-job reruns reuse the run-stable evidence artifact. Receipt
projection uploads only when absent; an existing receipt must match the stable
release, package, archive, registry and provenance facts. There is no secondary
`workflow_run` publisher or release
approval ceremony. CodeRabbit review and owner merge or close authority belong
to pull-request process rather than release jobs.

## Independent review

Independent semantic review is process evidence, not a GitHub authority or
required check. Task handoffs record the reviewed revision or diff and the
reviewer's findings. CodeRabbit supplies external pull-request review where it
is enabled. The repository owner may review, merge or close a pull request
directly.

CI does not parse approval bodies, manufacture approval, project an
`Independent review` check or require a distinct approving GitHub identity.

## GitHub activation

`.github/quality-gates.json` is the testable desired ruleset. `Quality` is the
ordinary pull-request gate. `PydanticAI conformance` and `CodeQL` remain
specialised compatibility and analysis checks, not additional release
admission ceremony. SonarQube and Codecov uploads run only on main pushes
because their service tokens must not be exposed to candidate-controlled
pull-request workflow YAML. Pull requests, conversation resolution, linear
history and blocked force-push/deletion remain the declared repository policy.
Approval-count and last-push-approval requirements are not part of this
contract.
