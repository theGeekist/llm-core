# llm-core Reusable Abstraction Review

Review evidence, consolidation plan and implementation ledger. This document remains
descriptive rather than task authority; implementation lands through the owning package's
normal task lifecycle, one seam at a time, behind tests.

## Provenance

Two independent read-only scans in each of two rounds, reconciled:

- **Codex scan** (`codex-root`): three-agent core/adapter/test sweep → 39-row candidate
  ledger (kept at `/private/tmp/llm-core-reusable-abstraction-candidates.md` at scan time).
- **Claude scan** (`claude`, coordinator): five line-level verification workers over the
  five P1 seams, then six fresh workers over P2 and new error, telemetry, path, time,
  collection and stream territory.
- **Codex round two:** three independent kernel, adapter and test/tooling agents plus exact
  function and token-window clone scans, recorded in
  `/private/tmp/llm-core-reusable-abstraction-round2.md` during reconciliation.

Claude wrote round one. Codex integrated the reconciled round-two addendum after a channel
identity collision made the Claude writer unreachable; the handover was announced before
the file changed. IDs (`K##`, `A##`, `T##`, `C##`, `D##`, `E##`, `N##`) remain the shared
vocabulary used by both runtimes.

Status vocabulary: `ready` (≥2 aligned consumers + clear owner) · `characterise`
(repetition real, contracts differ - study before merging) · `local` (isolate + test in
one owner first) · `prune` (remove dead basis) · `reject` (similarity superficial or a
shared API would hide authority).

P1 was independently line-verified by both scans. P2 combines independently confirmed
rows with additional Codex rows compared against Claude's six-worker scan during
reconciliation. A row may still be `characterise`, `local` or `reject` because evidence
does not erase semantic drift.

---

## P1 - line-verified seams (both scans)

### K01 · canonical JSON · `implemented` (adapter hazard retained)

Before implementation, two strict implementations were **output-equivalent for every
valid input** (confirmed byte-for-byte behaviour, not just shape):

- **A** `features/tooling/canonical-json.ts:3-160` - pure, reusable. Public
  `normalizeStrictJson` (`:140`), `freezeJsonValue` (`:143`), `canonicalizeJson` (`:159`).
- **B** `features/context/canonical.ts:169-275` - same algorithm, bundled with ~140 lines
  of unrelated context validators. Public `canonicalJson` (`:271`), `canonicalDigest`
  (`:274`, sha256 wrapper).

**Delta beyond Codex ledger (D1):** a **third, LAX** copy -
`adapters/pydantic-ai-spec/compiler.ts:88-95` (`canonicalJson`, used only by
`samePortableValue`). It silently maps `NaN`/`Infinity` → `"null"`, passes unsafe /
`>2^53` integers, does no surrogate validation, no `-0` normalisation, and has **no cycle
guard**. If any of its output is ever hashed or compared against the strict A/B forms,
digests disagree. Narrowly scoped (one internal comparator) but a latent correctness trap.

- Duplicated semantics: A ≡ B (key ordering, `-0`→`0`, reject non-finite/unsafe ints,
  surrogate validation, reject `undefined`/`bigint`/functions/symbol-keys/accessors/
  non-plain protos/sparse arrays/cycles).
- Generalisation boundary: keep context's `ResourceRef`/`EvidenceRef`/`PortableContent`
  validators local; keep `canonicalDigest` (sha256/I-O) out of the pure serializer; keep
  strict-json `normalize` and `deepFreeze` as distinct exported steps because tooling uses
  freeze/normalise without serialisation.
- **Owner layer - RESOLVED:** the consumer-neutral implementation belongs in the
  standalone `@geekist/strict-json` package. Canonicalisation defines deterministic JSON
  identity and is consumed by both llm-core and AIFSD; retaining it under either consumer
  would preserve an unnecessary ownership inversion. Before migration, AIFSD imported the
  older llm-core surface from `@geekist/llm-core/tools/runtime`
  (`config/portable-data.ts:8`, `content-digest.ts:8`). Pre-compat policy allowed that
  surface and both consumers, tests, smoke and docs to be replaced atomically with no alias.
- **Adapter-C (D1) - characterisation-first, NOT part of A/B dedup (Codex judgement):**
  treat PydanticAI's lax local `canonicalJson` as a third _consumer_ to characterise, not a
  copy to fold into the pure A≡B dedup. Strict replacement is desirable, but tests must
  first prove no currently-accepted spec depends on its lax behaviour (NaN/Infinity→null,
  unsafe integers, lone surrogates, or the cycle failure mode).
- Pre-migration call sites: A → tooling `executable.ts`, `action.ts`,
  `schema-registration.ts`, `validation.ts`, re-export `runtime.ts:15`. B → context
  `manifest.ts`, `compiler.ts`.
- Tests: golden output equivalence A≡B; rejection matrix; digest stability for
  `context/manifest.ts` identity values; adapter-C parity (its lax mishandling of
  `NaN`/unsafe-int/`-0` is a behaviour change to flag, not a silent swap).
- **Implemented boundary:** `@geekist/strict-json` now owns `canonicalize`, `normalize`
  and `deepFreeze`. llm-core imports those operations directly, its tooling
  `canonical-json.ts` implementation and `tools/runtime` aliases are removed, and context
  retains only its domain-named `canonicalJson`/SHA-256 digest wrapper. The PydanticAI
  comparator remains deliberately unchanged pending the characterisation above.

### K02 / K12 · portable snapshot (clone + deep-freeze) · `characterise` (latent cycle-safety drift)

Canonical owner already exists: `shared/portable-data.ts` (`deepFreeze:50-57`,
`cloneFrozen:65`) - descriptor-based, **pre-order** freeze with an `isFrozen` guard, and
the only variant that also freezes non-enumerable data properties. Imported by ~20 modules.
Yet the primitive is re-declared locally in ≥5 named owners, and the copies have **diverged
on a cycle-safety axis**.

**Delta beyond Codex ledger (D3):** `structuredClone` preserves reference cycles, so the
post-order freeze implementations are cycle-unsafe in isolation. Their current public
entry boundaries reject cycles before freezing, however, so this is a latent reuse hazard,
not a reachable hostile-cycle denial of service in the present call graph.

- **Cycle-safe** (pre-order + `isFrozen` guard): `shared/portable-data.ts`,
  `features/evaluation/portable.ts:153-161`, `features/artifacts/artifact.ts:177-183`,
  `features/context/compiler.ts:38-44`, `features/context/manifest.ts:27-33`.
- **Cycle-unsafe in isolation** (post-order and/or no guard causes unbounded recursion or
  stack overflow if reused without its present validator):
  `features/evidence/redaction.ts:74-82` (`deepFreezeJson`, post-order, no guard),
  `features/model/freeze.ts:2-9` (post-order, no guard), `features/state/validation.ts:244-252`
  (has guard but post-order, so it never trips on a fresh cycle).

Current reachability matters: `redactedNativeExtensions` validates with
`isNativeExtensions` before and after `structuredClone`; `createModelProfile` validates
the cloned profile before `deepFreeze`; and state `clonePortable` rejects non-acyclic
`isJsonValue` input before JSON cloning. The copies still disagree on cycle handling if
reused outside those boundaries. A second drift axis remains: only the shared owner
freezes non-enumerable data properties; all local copies use `Object.keys` or
`Object.values`.

- Proposed owner: `@geekist/strict-json`. Use `snapshot` where hostile input must be
  normalised and detached, and `deepFreeze` only for an already-valid `JsonValue` graph.
  Delete local copies and update call sites atomically rather than retaining forwarding
  aliases. Broad `cloneFrozen<T>` callers require characterisation because their current
  accepted-value and reference-alias contracts are wider.
- Generalisation boundary: never generalise to functions/ports/typed-arrays/native
  instances (Codex K02); keep feature snapshotters/validators (`snapshotEvidenceRef`,
  `snapshotResourceRef`, redaction sensitivity scan) local; confirm intent before folding
  the `JSON.parse(JSON.stringify())` clones in `state/validation.ts` / `model/profile.ts`.
- Cross-package ownership is resolved by the strict-json foundation; consumer migration
  remains a separately reviewed change - see C03.
- Tests: public boundaries reject cyclic input before freezing; direct shared-primitive
  tests prove cycle-safe termination and a frozen graph; idempotence; mutation rejection
  at every depth; `deepFreeze` reference identity preserved; `snapshot` repeated aliases
  independently detached; per-call-site byte-identical output regression.

### K03 · contract schema validators (media type / ResourceRef / EvidenceRef) · `characterise` (drift is dangerous)

The shapes are declared **once as types** in `contracts/schema.ts` (`ResourceRef:31`,
`EvidenceKind:74`, `EvidenceRef:89`) but **no runtime guard is exported from `#contracts`**

- so every feature re-implements the guard. Result: **9 `isResourceRef`**, **6
  `isEvidenceRef`**, **3 incompatible media-type validators**. Duplication real; drift
  dangerous.

Both of Codex's characterisation warnings confirmed at line level:

- **`hasOnlyKeys` name collision (real hazard):** `shared/portable-data.ts:35`
  `hasOnlyKeys(value, required, optional=[])` = required-present + subset (an "exact keys"
  check, no descriptor check) **vs** `features/state/validation.ts:24`
  `hasOnlyKeys(value, allowed)` = 2-arg, **subset-only, nothing required**. Same
  identifier, different arity, different contract - moving a call between them silently
  changes closure semantics.
- **`ActionDigest ≠ Digest` (never collapse):** `Digest` = `{algorithm:"sha-256", value:
64-hex}` (`versioning.ts:50`). `ActionDigest` = `{algorithm:"hmac-sha-256",
keyRef:SecretRef, value: base64url-43}` (`features/tooling/action.ts:14`,
  `isActionDigest:166`). `state/validation.ts:124-131` hand-rolls a **fourth** inline copy
  of the ActionDigest contract. Same field names, different algorithm, alphabet, and key
  set - a generic "digest validator" corrupts both.

**Delta / highest-priority correctness (D4):** media-type grammar has three incompatible
validators - **regex-A** (7 owners, byte-identical), **regex-B** (`model/profile-validation.ts:34`,
stricter RFC token grammar; accepts `% ' * \` | ~` that regex-A rejects, rejects the
newline/`\f`/`\v`-around-`;`that regex-A's`\s\*` accepts - a genuine contract fork), and
**`.includes("/")`** (`state/validation.ts:105`) which accepts anything with a slash:
`"a/b; \n injected"`, `"../../x"`, `"//"`. The widest hole in the codebase; almost
certainly unintended weakening.

- `EvidenceKind` 8-value list is duplicated verbatim with **zero drift** across R2/R3/R4/R6/
  R8/R10 - safe to centralise immediately.
- Proposed owner: `contracts/schema-guards.ts` (new) - the missing runtime projection of
  `schema.ts`: `isResourceRef`, `isEvidenceRef`, `EVIDENCE_KINDS`, `isClosedDigest`, the
  media-type regex - built on `hasExactKeys` (strongest closure) + `#contracts` `isDigest`.
  Promote one `hasExactKeys` to shared; delete the `artifact.ts` dup and media `exactKeys`.
- Generalisation boundary (**do NOT collapse to one guard**): ActionDigest stays separate
  (`state` inline copy should import `isActionDigest`); regex-B is a spec fork - **decide
  the governing media-type ADR first**; `.includes("/")` is a correctness fix but its
  tightening is a behaviour change; constructor/reconstructor forms
  (`registerMediaResourceRef`, `snapshotEvidenceRef`) consume the shared predicate but keep
  their materialisation. Land only the zero-drift structural guards first. Keep media-type
  validation feature-owned until the governing grammar is decided, then update its call
  sites as one explicit behaviour change.
- Tests: cross-owner conformance table (all 9/6 guards vs one fixture set); media-type
  differential (the three grammars); key-closure (getter/symbol/extra/missing);
  ActionDigest-vs-Digest mutual rejection; EvidenceKind 8-accept/9th-reject.

### A01 · specification observation capture · `characterise`

Shared seam = `capturePortable<T>(value, label): T`: capture caller value before feature
validation, reject non-portable data, deep-clone-and-freeze. There are three named
implementations plus one equivalent inline provider boundary:

- Spec Kit `adapters/spec-kit/portable.ts:74` (bespoke `assertPortableDescriptors:10-65` +
  `cloneFrozen`).
- BMAD `adapters/bmad/parsing.ts:53` and OpenSpec `adapters/openspec/public.ts:200` -
  **byte-identical**, both via `isJsonValue` + `cloneFrozen`.
- **Inline fourth provider boundary:** AI-SDLC `adapters/ai-sdlc/public.ts:141-149` performs
  the same `isJsonValue` plus `cloneFrozen` capture directly, but does not define a fourth
  named `capturePortable` function.
- 18 named `capturePortable` calls are confirmed across Spec Kit (13), OpenSpec (3) and
  BMAD (2); AI-SDLC adds one inline capture boundary outside that count.

- Drift: BMAD/OpenSpec use shared `isJsonValue`; Spec Kit's `assertPortableDescriptors` is
  a genuinely different engine - different error text ("without getters or sparse arrays"),
  explicit sparse-array / exotic-prototype / non-finite-number guards, cycle rejection via
  an `active` Set. **Open gate (refined by Codex):** `isJsonValue` is descriptor-safe and
  dense but _permits_ unsafe finite integers and lone surrogates and _accepts array
  subclasses after detachment_; Spec Kit also permits unsafe/lone values but explicitly
  _rejects_ non-Array prototypes. So the shared observation primitive must first declare
  whether it snapshots **strict canonical JSON** or **broader portable JSON**, then
  characterise the array-prototype and numeric/Unicode delta before any migration. Codex
  preference: a single detached **strict-canonical** snapshot boundary if adapter contracts
  allow it.
- Proposed owner: use `@geekist/strict-json` `snapshot` if the strict-canonical gate is
  accepted. Keep a provider-owned labelled assertion wrapper only where provider-specific
  error vocabulary is required. Do not add a parallel `capturePortable` primitive to
  llm-core shared code.
- Generalisation boundary: per-provider `label` strings, post-capture shape validators
  (`assertTimestamp`, `hasOnlyKeys` key-sets, field parsing), and observation _types_ stay
  provider-owned.

### T01 · test `MemoryToolReceiptJournal` fixture · `ready`

Full agreement between scans. Two near-identical ~160-LOC bodies:
`tests/evidence/tool-receipt-journal.test.ts:79-239` (`MemoryToolReceiptJournal`, private
`#byId`/`#byKey`) and `tests/application/tool-execution/execute-fixtures.ts:121-278`
(`MemoryJournal`, **public** `byId`/`byKey`, already the shared fixture imported by 5
files). **Exactly 37 constructions** (7 + 30).

- Required test inspection seam: keep `byId`/`byKey` **public** because tool-execution tests
  reach in (`journal.byId.size`, `[...journal.byId.values()]`, `journal.byId.set(...)` fence
  injection). This is not a historical compatibility obligation. Remaining diffs are
  cosmetic (error string/type, one arg, `load` signature).
- Proposed owner: `tests/support/memory-tool-receipt-journal.ts` (single canonical class,
  public-field superset). Rename all repository call sites atomically to
  `MemoryToolReceiptJournal`; do not retain a `MemoryJournal` compatibility alias. The
  evidence test imports the shared fixture and deletes its inline copy.
  Reality: this is "merge the standalone `evidence/` copy into the existing shared one," not
  "extract from 37 scattered copies."
- Keep an independent contract suite so the fake is not its own oracle (Codex T01).

---

## P2 - round-two line-verified seams

Round two tested the original P2 rows and deliberately scanned territory omitted from P1.
The extraction unit is always concept-owned. A row is not permission to create generic
`shared`, `utils` or `helpers` modules.

### Kernel, contracts and cross-cutting mechanics

| ID   | Status               | Evidence and proposed owner                                                                                                                                                                                                                                                       | Boundary                                                                                                                                                                        |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K02  | `characterise`       | Six further exact pre-order `deepFreeze` copies at `interaction/content-registration.ts:178`, `agent/definition.ts:9`, `agent/skills.ts:35`, `media/validation.ts:26`, `model/prompting.ts:123`, `model/schema-resolution.ts:53`; consume `@geekist/strict-json` after validation | Validate each caller first; some copies currently traverse accessors or rely on earlier cycle rejection.                                                                        |
| K04  | `ready`              | Four plain `Digest` equality copies; add `digestsEqual` and `schemaRefsEqual` beside `contracts/versioning.ts`                                                                                                                                                                    | Never accept keyed `ActionDigest`, which includes `keyRef.secretId`.                                                                                                            |
| K05  | `ready`              | Repeated evidence redaction category and registration mechanics; own in `features/evidence/redaction-registration.ts`                                                                                                                                                             | Category vocabulary and registration can be shared; caller redaction policy cannot.                                                                                             |
| K06  | `ready`              | Missing runtime `CapabilityId` guard noted at `profile-validation.ts:27`; own in `contracts/capabilities.ts`                                                                                                                                                                      | Exact opaque capability identity only.                                                                                                                                          |
| K07  | `ready`              | Exact capability-range classification repeats with result-vocabulary drift; own in `contracts/capability-version-range.ts`                                                                                                                                                        | Share classification, not caller result labels.                                                                                                                                 |
| K08a | `ready`              | Strict `Date.toISOString()` round-trip predicate repeats across interaction, capability bindings, receipts, control, storage and state                                                                                                                                            | Name it `isCanonicalInstant`; it rejects offsets and non-canonical fractional precision.                                                                                        |
| K08b | `characterise`       | BMAD, Spec Kit, AI-SDLC and Pydantic bridge accept distinct timestamp grammars                                                                                                                                                                                                    | Keep RFC 3339, observed-date and protocol-specific predicates named and local. No configurable `isTimestamp`.                                                                   |
| K09  | `ready`              | Receipt and agent status membership arrays repeat away from their type owners                                                                                                                                                                                                     | Export owner-specific constants using `as const satisfies readonly T[]`; do not merge unrelated unions.                                                                         |
| K10  | `characterise`       | Memory and interaction use the same 12-key sensitive vocabulary and normalisation                                                                                                                                                                                                 | The sources are semantically, not byte, identical. Extract only descriptor-safe traversal plus the exact reject policy; broader redact/reject/preserve walkers remain separate. |
| K11  | `ready`              | Keyed action-digest equality repeats; own beside `features/tooling/action.ts`                                                                                                                                                                                                     | Keep the keyed security domain distinct from K04.                                                                                                                               |
| DT01 | `ready`              | Expiry comparison drifts at `control/control-values.ts:57`, `tool-execution/execution-control.ts:70`, `storage/cache.ts:96`                                                                                                                                                       | Layer ordering above K08a. Invalid-input fail-open or fail-closed policy stays explicit at each caller.                                                                         |
| E01  | `partially resolved` | `shared/maybe.ts` exposes descriptor-safe `maybeTry`; capability-binding retry has adopted it, while remaining portable-data and state-authentication conversions need caller-level review                                                                                        | Pipeline 1.2.1 resolves the thenable-inspection gate. Preserve `MaybePromise` and each caller's fallback value.                                                                 |
| E02  | `characterise`       | `model/profile.ts:48-52` and `evidence/redaction.ts:96-102` clone or throw a domain `TypeError`                                                                                                                                                                                   | Use strict-json `snapshot` only for strict JSON inputs; keep broader clone contracts and domain messages caller-owned.                                                          |

N01 model diagnostic construction, N03 the existing capability-binding retry engine and
N06 best-effort event projection remain owner-local. N03 already owns retry authority, so
no second retry engine should be introduced. N02 generic rejected results, N04 durations,
N05 collection equality, N08 shared release inventories, generic timeout, error conversion
and stream wrappers are rejected. N07's dormant `MaybeAsyncIterable` bridges require usage
evidence before any growth.

### Adapters and application boundaries

| ID   | Status         | Evidence and proposed owner                                                                                                                       | Boundary                                                                                                                                              |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A02a | `ready`        | Repeated retrieval text, batch, embedder and splitter input guards across AI SDK, LangChain and LlamaIndex; `features/retrieval/adapter-input.ts` | Preserve provider extraction, vector namespaces, filters, scores and `MaybePromise`.                                                                  |
| A02b | `characterise` | LangChain and LlamaIndex native document metadata projections are byte-equivalent                                                                 | Descriptor traversal can avoid ordinary getters, but arbitrary Proxy traps must fail closed. Provenance versus redaction policy must also be decided. |
| A03  | `ready`        | Three key-value adapter bodies, including two in `llamaindex/storage-key-value.ts:55-139`; `features/storage/key-value-adapter.ts`                | Backend owns batching/listing; deletion normalisation is mandatory policy; preserve `MaybePromise`.                                                   |
| A04  | `ready`        | AI SDK and LlamaIndex repeat conversation text projection and fail-closed record collection; `adapters/conversation-text-projection.ts`           | Share descriptor-safe text-part mechanics. Roles, timestamps, accepted part kinds and revisions stay native.                                          |
| A05  | `ready`        | Four exact UI conversation-event gates; `adapters/ui/conversation-projection.ts`                                                                  | Stateless gate only; each UI lifecycle machine stays local.                                                                                           |
| A06  | `local`        | One serial NDJSON process transport at `adapters/runtimes/stdio.ts:9-122`                                                                         | Isolate framing and lifecycle first. Decoding, timeouts and safe failure projection stay caller-owned.                                                |
| A07  | `ready`        | LangChain and LlamaIndex prompt-template projection; `adapters/prompt-template-projection.ts`                                                     | Providers supply extracted values and retain their own error text and metadata namespace.                                                             |
| A08a | `prune`        | Dormant `model/prompting.ts:52-121` is structurally identical to `adapters/shared-native-metadata.ts:3-72` modulo names and has no consumers      | Remove the dormant copy; its exported names are intentionally absent from the model public front.                                                     |
| A08b | `characterise` | The live adapter metadata projection traverses untrusted native objects                                                                           | Descriptor traversal can avoid ordinary getters; Proxy traps are observable and must fail closed. Do not create a global sensitive-key policy.        |
| A09  | `local`        | Three AI SDK media throw boundaries                                                                                                               | Keep fixed-message media invocation local; model, stream and observer error channels differ.                                                          |
| A10  | `characterise` | Fixed-message, throw-based native invocation repeats in media and parser adapters                                                                 | Only share if the boundary is identical; never absorb result-value, stream-event or observer errors.                                                  |
| A11  | `reject`       | Event projection, telemetry microtasks and conversation callbacks look alike                                                                      | Timing and status vocabularies are observable semantics.                                                                                              |
| A12  | `reject`       | Several async iterable loops                                                                                                                      | Provider terminal authority, accumulation, replay, cleanup and error channels differ. Reuse existing Step primitives only where honest.               |
| A13  | `reject`       | Retry, source timeout, compiled provider timeout and measured duration                                                                            | These are different authorities despite numeric similarity.                                                                                           |
| A14  | `reject`       | Source paths, redaction paths, CLI observations and process arguments                                                                             | Normalisation at one boundary can become disclosure or false acceptance at another.                                                                   |
| A15  | `ready`        | Exact PortableContent text projection at `retrieval/document.ts:28-38` and `retrieval/query.ts:12-22`                                             | Add one retrieval-owned internal projection; retain the public domain-named functions.                                                                |

### Tests and repository tooling

| ID   | Status         | Evidence and proposed owner                                                                                                                          | Boundary                                                                                                                          |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| T02  | `ready`        | One-shot deferred result in 17 sites; `tests/support/deferred-result.ts`                                                                             | No timers, retries or scheduler semantics.                                                                                        |
| T03  | `ready`        | Repeated deterministic identities                                                                                                                    | Split agent and interaction owners; preserve exhaustion and coupled-counter policy.                                               |
| T04  | `ready`        | Architecture walkers duplicate and import regexes diverge, missing side-effect imports in one gate; `tests/architecture/architecture-source-scan.ts` | Parse TypeScript syntax with the AST. Ownership rules and violation reporting stay local.                                         |
| T05  | `ready`        | Repeated SHA-256 schema and HMAC action-digest ports; `tests/support/tooling/tooling-cryptographic-ports.ts`                                         | Keep keyed and unkeyed digest domains separate.                                                                                   |
| T06  | `ready`        | Checked process execution repeats in root qualification scripts; `scripts/checked-command.ts`                                                        | Invocation and checked failure only; qualification sequencing stays local.                                                        |
| T07  | `ready`        | Temporary workspace lifecycle repeats in four root script suites; `scripts/test-workspace-fixtures.ts`                                               | Test lifecycle only, never production temporary-directory policy.                                                                 |
| T08  | `local`        | Adjacent fixture readers differ in bytes, text, JSON and provenance                                                                                  | Keep caller `import.meta.url` explicit.                                                                                           |
| T09  | `ready`        | Repeated MaybeIterable and agent-event collection                                                                                                    | Split `tests/support/maybe-iterable.ts` from agent-event support; preserve sync-or-async visibility.                              |
| T10  | `ready`        | Workflow ActionDigest comparison and failed results repeat                                                                                           | Workflow-test-owned helpers only.                                                                                                 |
| T11  | `characterise` | Hostile accessor, proxy, cycle and sparse fixtures repeat, but the bucket is heterogeneous                                                           | Extract coherent owner-local constructor families, not one hostile-data fixture bag.                                              |
| T12a | `ready`        | The exact digest triple repeats in five specification, compiler and adapter suites                                                                   | Move the neutral constants to specification test support, or keep them local; do not make kernel tests depend on adapter support. |
| T12b | `local`        | Broader authority, source, decision and malformed fixtures resemble one another                                                                      | Keep them independent because they exercise different constructors and failure boundaries.                                        |
| T13  | `ready`        | Tool-execution succeeded results and approval policies repeat                                                                                        | Split owner-specific result and policy fixtures; avoid a configurable universal outcome factory.                                  |
| T14  | `characterise` | POSIX path rendering repeats; one v2 boundary uses literal `/` instead of the platform separator                                                     | Share rendering after tests. Keep lexical containment, realpath and symlink policy separate.                                      |
| T15  | `ready`        | Strict synchronous-result assertion repeats                                                                                                          | Reject every PromiseLike, including foreign thenables; never await or normalise.                                                  |
| T16  | `local`        | Model resolver discriminant assertions repeat in one suite                                                                                           | Keep model-owned; generic union assertions erase domain invariants.                                                               |

---

## AIFSD cross-package observations (C-series)

- **C01** `digestsEqual` copied 4× - `materialization-plan.ts:18`, `materialize.ts:33`,
  `lock.ts:32`, `version-range.ts:62` (`ready`; prefer contract-owned kernel op if the
  public boundary is accepted - see K04).
- **C02** trust vocabulary repeats across `manifest.ts`, `catalog-validation.ts`,
  `resolver-correspondence.ts` and `catalog-entry.ts`; numeric ordering repeats in
  `manifest.ts` and `catalog-entry.ts` (`ready`; keep selection policy separate from data).
- **C03** strict JSON normalisation/canonicalisation/freezing (`implemented`) and
  immediate snapshot adoption (`characterise`): cross-package JSON mechanics now have the
  explicit `@geekist/strict-json` owner. Redirect `content-digest.ts` canonicalisation,
  `portable-data.ts` normalisation and its valid-graph freeze implementation first. Keep
  the current AIFSD wrapper and freeze timing: package `snapshot` freezes immediately,
  while resolution deliberately freezes the verified catalogue only at the custom-resolver
  boundary. Keep `SecretRef`, SHA-256/Digest branding, closure ordering and diagnostics in
  their existing owners.
  AIFSD now imports `canonicalize`, `normalize`, `deepFreeze` and `StrictJsonError`
  directly from strict-json. Its wrapper still returns AIFSD diagnostics and leaves
  accepted snapshots unfrozen until the existing domain boundary. Package `snapshot`
  remains a separately characterised future adoption.
- **C04a** object-record predicate (`characterise`, reusable):
  `aifsd/src/config/closed-object.ts:isPlainObject` is now the imported diagnostic guard
  for six modules; `portable-data.ts` retains one second weak local predicate for settings
  traversal. The current name overstates its contract because both implementations accept
  dates, class instances and every other non-array object.
  Select one explicit shared contract before promotion: either a genuinely plain-record
  predicate with prototype and descriptor rules, or a deliberately named non-array-object
  predicate. Strict-json `isRecord` recursively validates the whole subtree, so it is not
  a drop-in replacement for this shallow diagnostic guard.
- **C04b** keys-outside-set operation (`ready`, reusable):
  `aifsd/src/config/closed-object.ts:unknownKeyDiagnostics` contains a generic operation
  beneath its AIFSD-specific result: enumerate own enumerable string keys outside an
  allowed set. Promote that mechanic under a contract name such as `keysOutside`; retain
  conversion to AIFSD `Diagnostic` locally. Human review added stable `reasonCode` mapping
  through `diagnostic.ts`, so retain `closed-object.ts` until strict-json actually exposes
  the narrower keys-outside operation and diagnostic granularity is pinned.
- **C05** ordered-candidate pipeline (`ready` after line verification): `resolution.ts:51-73`
  and `resolver-correspondence.ts:100-133` repeat filtering and trust ordering. Expose the
  ordered candidates, not a selector: the default resolver selects one while ambiguity
  detection needs the complete highest-version tie set.
- **C06** duplicate-member detection (`ready`): `catalog-entry.ts:54-67` and
  `lock.ts:94-107` are exact clones. Keep the catalog-owned predicate.
- **C07** AIFSD test result support (`ready`, AIFSD-test-local): seventeen exact synchronous
  assertions plus repeated unwrap functions justify `tests/config/support/config-result.ts`.
- **C08** thenable discovery (`resolved/pruned`): human review removed AIFSD's local
  `maybe.ts`. AIFSD now consumes descriptor-safe `maybeAll`, `maybeThen` and `MaybePromise`
  from `@wpkernel/pipeline` 1.2.1; retain the hostile thenable regression suite rather than
  recreating a package-local basis.
- **C09** generic `ConfigurationResult` factories and a generic path validator (`reject`):
  both would save little while erasing diagnostic and path authority.
- **C10** strict JSON failure mapping (`ready`, AIFSD-local): diagnostics now carry stable
  renderer-neutral `reasonCode` values. Replace the ineffective thrown-string classifier in
  `portable-data.ts` with an explicit `StrictJsonError.code` mapping during migration. Never
  coerce or parse arbitrary thrown values; preserve the hostile-proxy regression's generic
  `invalid-portable-value` result unless the public diagnostic contract is intentionally
  changed.

---

## D01 · prune before growing the functional basis

`shared/fp.ts` `toNull`/`toTrue`/`toFalse`/`toArray`/`compose` and `shared/maybe.ts`
`maybeTap`/`maybeMapOr` have **no live internal callers** outside the retired `functional`
barrel. Confirm package and generated consumers, then remove them as a separately scoped
follow-up to `architecture-legacy-functional-removal`. `maybeTry` is no longer in the prune
set: E01 found aligned fail-closed consumers, pipeline 1.2.1 resolved descriptor-safe
thenable handling, and capability-binding retry has adopted it. Retain `MaybePromise`,
`maybeMap`, `maybeChain`, `maybeReduce`,
`bindFirst` and the Step basis where usage is real. Do not preserve a utility museum.

---

## Rejected global abstractions (both scans agree)

Generic `isRecord`/`hasOnlyKeys`/`assertValid` (call sites accept different prototypes,
required-key rules, hostile objects) · one configurable timestamp validator (distinct
canonical-instant vs observation-date contracts - K08) · one digest comparator (plain
`Digest` vs keyed `ActionDigest` - K04/K11) · generic `uniqueBy` (domain identity is the
point) · generic `WeakSet`/`WeakMap` registry (each establishes a different authority/liveness
boundary) · unified UI state machine / vector store / YAML / frontmatter parser (native
semantics differ) · one filesystem walker for docs/SLOC/build/smoke/fixtures (symlink,
exclusion, async, runtime requirements differ) · Promise-normalising run/stream/retry/eval
wrappers (would erase required `MaybePromise` behaviour) · one error-message or base-error
utility · global duration, duplicate-collection or sensitive-key helpers · shared release
surface inventories (independent defence-in-depth oracles) · production validators imported
by their own conformance tests.

---

## Open decisions (must resolve before the relevant seam lands)

1. **K01 owner layer - IMPLEMENTED:** `@geekist/strict-json`. The llm-core
   `tools/runtime` implementation and aliases have been removed and both consumers now
   use the package directly.
2. **K03 media-type grammar - OPEN:** regex-A vs regex-B is a genuine fork - which ADR
   governs the accepted grammar? Centralising silently tightens/loosens 9 call sites until
   this is fixed.
3. **A01 snapshot boundary - OPEN (refined):** the shared observation primitive must first
   declare strict-canonical vs broader-portable JSON. `isJsonValue` permits unsafe
   ints/lone surrogates and array subclasses; Spec Kit permits those but rejects non-Array
   prototypes - characterise that delta before adopting one engine. Codex prefers a single
   detached strict-canonical boundary.
4. **C03 AIFSD freeze timing - RESOLVED FOR INITIAL MIGRATION:** canonicalisation,
   normalisation and already-valid graph freezing now use strict-json. AIFSD keeps its
   normalize-only snapshot wrapper and existing later freeze boundary. Adopting package
   `snapshot` remains open until immediate freezing and alias detachment are deliberately
   accepted. Null-prototype records are accepted and custom-array prototypes are rejected
   by regression tests. `SecretRef` remains outside strict-json.

## Recommended sequencing (highest leverage / lowest risk first)

1. **T01** - pure test consolidation, single constraint, zero production risk.
2. **K02**: consolidate the local freeze implementations after pinning current cyclic-input
   rejection at each public boundary; the unsafe isolated variants are latent reuse risks.
3. **A01**: largest adapter trust-boundary win once the engine gate is closed.
4. **K01/C03 - completed:** strict-json is wired into llm-core and AIFSD atomically.
   Continue to characterise the lax adapter-C consumer and AIFSD snapshot timing before
   replacing either remaining local policy.
5. **K03** - land the zero-drift structural guards first; after the media-type ADR, replace
   all grammar copies and fix the `.includes("/")` hole as a flagged behaviour change.
6. **T02/T04/T05/T06/T07/T09/T10/T13/T15**: the lowest-risk round-two test and tooling
   extractions, one concept-owned seam at a time.
7. **K04/K06/K07/K09/K11/A03/A05/A07/A15**: production-ready rows, each behind focused
   equivalence and hostile-input tests.
8. **D01 prune** only after E01's `maybeTry` decision is separated from the dead basis.
