# PR #10 review correction

The user requested meaningful consolidation of strings, existing repository
conventions and clear ownership across the source changed by PR #10:

- [OpenSpec public line 428](https://github.com/theGeekist/llm-core/pull/10#discussion_r4321607441): central definitions must explain what values mean, how they are used and what to expect; the request extends to other source changes.
- [OpenSpec public line 431](https://github.com/theGeekist/llm-core/pull/10#discussion_r4321609485): another instance of the same unowned-string problem.
- [OpenSpec status contract line 6](https://github.com/theGeekist/llm-core/pull/10#discussion_r4321611166): the unexplained provenance identifier also needs meaningful ownership.

The [review summary](https://github.com/theGeekist/llm-core/pull/10#pullrequestreview-5580926938)
asks for meaningful consolidation and existing conventions. Its substantive
request applies regardless of its GitHub review-state label.

## Accountability and approval

The correction remains a separate PR, ready for explicit user review. Never
create draft PRs. Merging requires explicit user approval. Automated checks and independent agent review are technical evidence;
neither represents the user's acceptance.

## Existing conventions to apply

- Contract identity and checked `contractVersion`, `digest` and
  `extensionNamespace` constructors retain their established meanings.
- A2A support and AI SDK native-contract modules group typed authority,
  operations and qualification evidence under their adapter owner.
- Native conversation profiles own provider and route identities.
- Source-owned deterministic specification IDs retain their native semantics;
  they are not core UUIDs.

A catalogue must be used by the implementation, preserve literal types and
explain source/fixture/operation relationships. A bag of arbitrary aliases is
not sufficient. Human prose, native field names and machine codes have distinct
owners and should not be mixed into one untyped lookup table.

## Comment-to-change mapping

| Request                                                 | Implementation owner                                                                                                 | Meaning retained                                                                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| OpenSpec public line 428; applies across changed source | OpenSpec contract/fixture descriptors and named artifact/dependency/graph identity and evidence-binding builders     | The exact source tuple, edge direction, native document and evidence location remain explicit.                                        |
| OpenSpec public line 431                                | Typed operation declarations consume complete qualification fixtures; each adapter keeps its own authority catalogue | A fixture ID is tied to its immutable digest and recognised source contract, rather than copied independently.                        |
| OpenSpec status contract line 6                         | Distinct repository and published-package descriptors                                                                | Commit provenance and package version/SHA-1 integrity remain separate, along with dependency fields, states and independent fixtures. |

The same ownership check covers PydanticAI authority/capability/diagnostic
semantics, SpecKit file kinds/provenance/identity and qualification evidence,
Claude native stream/failure/route semantics, and Sidecar exact runtime,
qualification evidence and probe reasons. Adjacent profile changes only wire
the same typed identities into registration and execution.

## Intentionally retained literals

- Portable operation IDs, result/status tags and graph kinds are checked by
  their existing closed feature contracts and constructors. They retain that
  authority rather than gaining a parallel vocabulary.
- Native JSON property names remain in the exact structural validators or
  owned native event descriptors. They identify upstream fields, not portable
  identities; changing them would change the external contract.
- Local projection discriminants remain in `ClaudeStreamProjection` in
  `src/adapters/claude-native-session/runner.ts`; probe report outcome,
  addressability and timing tags remain in `AntigravitySidecarProbeReport` and
  `BusyTurnDeliveryClassification` in the Sidecar `probe.ts`. Native SpecKit
  overlay-operation tags retain their `SpecKitOverlayOperation` authority in
  `src/adapters/spec-kit/overlay.ts`. These exact closed types and their routing
  explain each retained value; this is not a general exemption for single-use
  domain strings.
- Human validation/unsupported-operation prose stays with its named validation
  or operation declaration. Machine diagnostic codes and their meaning are
  bound separately by typed diagnostic definitions.
- TypeScript typeof tags, JSON grammar, separators and regex syntax are
  language/parser mechanics. They are not adapter catalogues.
- Existing test expectations and upstream fixture bytes remain independent;
  they are not rewritten to import the new definitions as expected values.
- The PR #10 checker edit only retired three obsolete seals. It introduced no
  new string vocabulary; this follow-up makes no checker or baseline edit.

Existing immutable-fixture, exact-operation, native-failure and graph-binding
suites remain independent. Review additionally found a real malformed-input gap:
array-valued document kinds or provenance tiers could stringify to valid labels.
The correction now requires actual strings and rejects those malformed JSON
values; valid pinned inputs, serialized values and public API types are unchanged.
A focused regression verifies both rejections and the valid constitution's
portable decision meaning without importing the new catalogue as its oracle.

## PR #12 bounded review follow-up

The subsequent functional-style comment is explicitly nonblocking. The touched
PydanticAI compiler already uses `maybeMap` and `MaybePromise`; synchronous
validators and identity builders remain synchronous. Claude streaming and Sidecar
probe orchestration await real client/observer effects. Reworking their stateful
runtime sequencing would exceed this small follow-up and is deferred.

The small convention improvement reuses `compareUtf16CodeUnits` for SpecKit
provider ordering, replacing a nested conditional without changing tie semantics.
Overlay/base scope validation now consistently uses the existing workflow identity
helpers. No new generic utility or async abstraction is introduced.

The verified CodeRabbit coercion findings are corrected: OpenSpec artifact status
and SpecKit source role/authority require actual strings before closed-value
checks. Regressions exercise both OpenSpec contracts and both source fields;
existing independent fixtures continue to prove valid input semantics.
