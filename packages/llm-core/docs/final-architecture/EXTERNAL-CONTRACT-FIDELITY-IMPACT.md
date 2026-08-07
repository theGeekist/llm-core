# External Contract Fidelity Impact

Architecture version: v2
Assessment status: accepted ADR-017 correction contract
Assessment date: 2026-08-07

This assessment identifies code and planning that currently treats semantic
loss as a support level. It is the accepted correction contract for ADR-017
and its implementation tasks.

## Impact summary

The correction is material. It affects two published package subpaths, existing
provider and runtime adapter code, the shared specification contract, five
implemented specification adapters, their tests and several proposed tasks.

There is no A2A or MCP implementation to migrate. Their impact is preventive:
the protocol task must use the recognised protocol contracts directly before
implementation begins.

## Integration qualification matrix

An implemented integration is pinned here to the authority used by the current
code and fixtures. A future integration whose implementation has not been
selected cannot honestly be pinned yet. Before claiming such a task, its owner
must replace the deferral in that task with the selected recognised authority
and exact version or commit, add an immutable local authority source to
`required_reading`, and name the native surface and executable fixture owner.
Research profiles provide selection context, not substitute authority.

| Integration and exact operation family                                                                | Recognised authority and current pin                                                                                                           | Integration-owned native surface                                                              | Executable fixture owner                                                                |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AI SDK provider generation, streaming, tool approval, warnings, metadata, generated files and sources | Vercel AI SDK packages `ai@7.0.37` and `@ai-sdk/provider@4.0.3`                                                                                | AI SDK messages, warnings, provider metadata, approval events, files and source parts         | `adapter-ai-sdk-native-contract-correction`                                             |
| OpenSpec native observation, portable derivation and any separately qualified export or round trip    | OpenSpec repository commit `19d41714c8b790488732687443713e406ef5aeef`, package line `1.6.0`                                                    | Source snapshot, schema identity, extensions and unprojected constructs                       | `specification-exact-operation-contracts`                                               |
| AI-SDLC native observation, portable derivation and any separately qualified export or round trip     | AI-SDLC repository commit `11f2c83f17c797e85dcb65d6e1a9c17d02eb0335`, Draft `ai-sdlc.io/v1alpha1`                                              | Resource documents, status, policy, adapter bindings and extension fields                     | `specification-exact-operation-contracts`                                               |
| BMAD native observation and portable derivation                                                       | BMAD Method repository commit `bb45db4aa4496c69239f9c0629c290fd1b072fc9`                                                                       | Native artefacts, workflow and skill metadata, configuration and source snapshot              | `specification-exact-operation-contracts`                                               |
| Spec Kit native observation and portable derivation                                                   | Spec Kit repository commit `c0fe0e43cd728ebc3dd1f714343f3921510a157f`                                                                          | Native specification, plan, task, overlay and source metadata                                 | `specification-exact-operation-contracts`                                               |
| PydanticAI specification observation, portable derivation and compilation target                      | PydanticAI `2.19.0`, repository commit `ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5`                                                              | Agent specification, model and tool settings, dependencies, output schema and source snapshot | `specification-exact-operation-contracts`                                               |
| Existing PydanticAI runtime compatibility proof                                                       | PydanticAI `2.19.0`, repository commit `ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5`                                                              | Events, sessions, history, dependencies, output and provider state                            | `runtime-operation-contract-correction`                                                 |
| A2A identity, task, delegation, event, artefact, cancellation and failure operations                  | Deferred until `adapters-protocol-qualification` claim; select and pin the recognised A2A specification and SDK then                           | A2A messages, tasks, contexts, artefacts, events, errors and extensions                       | `adapters-protocol-qualification`                                                       |
| MCP tool, resource, lifecycle, cancellation and error operations                                      | Deferred until `adapters-protocol-qualification` claim; select and pin the recognised MCP specification and SDK then                           | MCP tools, resources, prompts, lifecycle messages, errors and extensions                      | `adapters-protocol-qualification`                                                       |
| LangGraph graph execution, reducer, interrupt, checkpoint and thread operations                       | Deferred until `adapter-langgraph-runtime` claim; select and pin one exact TypeScript package set then                                         | Graph state, reducers, interrupts, checkpoints, threads and native events                     | `adapter-langgraph-runtime`                                                             |
| New PydanticAI runtime adapter operations                                                             | Deferred until `adapter-pydantic-ai-runtime` claim; select and pin the supported Python package and transport set then                         | Agent runs, event stream, sessions, message history, dependencies and provider state          | `adapter-pydantic-ai-runtime`                                                           |
| Strands agent, orchestration, session and event operations                                            | Deferred until `adapter-strands-runtime` claim; select and pin one language and exact SDK version then                                         | Agent state, orchestration, sessions, hooks, events and provider extensions                   | `adapter-strands-runtime`                                                               |
| Temporal workflow, activity, history, signal, update, cancellation and retry operations               | Deferred until `runtime-temporal-reference` claim; select and pin one SDK version and server compatibility set then                            | Workflow history, activities, signals, updates, retries, cancellation and search attributes   | `runtime-temporal-reference`                                                            |
| Coding-agent and connector operations                                                                 | Deferred independently until the owning integration task is claimed; each selected product, protocol or SDK receives its own authority and pin | Product-native sessions, approvals, resources, errors, credentials and extensions             | `adapter-coding-agent-integration` or the corresponding `integrations-connector-*` task |

The matrix is operation-scoped. Sharing a type name or producing a portable
projection does not qualify another row or a native operation family.

## Published contract impact

### `@geekist/llm-core/specifications`

The published specifications front currently exports `ConversionFidelity`,
`ConversionIssueDisposition`, `ConversionReport` and
`createConversionReport`. `SpecificationGraph.report` makes the support level
part of the graph contract.

Directly affected production modules:

- `src/features/specifications/types.ts`
- `src/features/specifications/factory.ts`
- `src/features/specifications/validation.ts`
- `src/features/specifications/graph-bindings.ts`
- `src/features/specifications/public.ts`
- `src/specifications/index.ts`
- `src/application/specification-compiler/compiler.ts`
- `src/application/specification-compiler/public.ts`
- `src/application/specification-compiler/resolution.ts`
- `src/application/specification-compiler/runtime.ts`
- `src/application/specification-compiler/types.ts`
- `scripts/smoke-package.mjs`

The replacement must identify the exact operation being claimed, its source
contract and version, its `supported`, `unsupported` or `not-applicable`
disposition, native-source retention and executable fixtures. `not-applicable`
requires exact source evidence that the operation or semantic dimension is
absent. Diagnostics may explain rejection, but they cannot turn a narrowed
result into supported conversion.

The application compiler consumes `ConversionIssue` and its rejected
disposition while reviewing and resolving accepted scope. It must migrate with
the graph contract so an obsolete loss scale does not survive behind the
public replacement. The packed-package smoke script imports
`ConversionReport`; because `release:qualify:llm-core` exercises that script,
the specification correction owns and verifies it as a release-facing
consumer.

### `@geekist/llm-core/adapters/ai-sdk`

The published AI SDK front exports `AI_SDK7_SEMANTIC_LOSS`. Every completion
also emits the same list as `semanticLoss` under the AI SDK native extension.

Directly affected production modules:

- `src/adapters/ai-sdk/index.ts`
- `src/adapters/ai-sdk/provider-metadata.ts`
- `src/adapters/ai-sdk/provider-model.ts`
- `src/adapters/ai-sdk/provider-types.ts`

Adjacent portable model contracts may require an explicit native event or
response surface rather than additional portable fields:

- `src/features/model/content.ts`
- `src/features/model/model.ts`
- `src/features/model/response.ts`

## Provider adapter findings

The AI SDK 7 adapter currently has four correctness gaps under ADR-017:

1. provider metadata is silently omitted when no trusted redactor is supplied;
2. warning detail is replaced with one generic message;
3. streaming approval and native metadata have no retained native surface; and
4. generated files and sources are not retained by the completion contract.

Required security redaction is not semantic-loss permission. The corrected
contract must either preserve validated, namespaced, redacted native data or
reject the affected operation explicitly. It must not succeed after silent
omission.

Primary tests:

- `tests/adapters/ai-sdk7/model-fixtures.ts`
- `tests/adapters/ai-sdk7/model.test.ts`
- `tests/architecture/public-exports-characterization.test.ts`

## Specification adapter findings

The following implemented adapters construct successful graphs with
`fidelity: "partial"` or issues with `disposition: "degraded"`:

- `src/adapters/openspec/public.ts`
- `src/adapters/ai-sdlc/public.ts`
- `src/adapters/bmad/public.ts`
- `src/adapters/spec-kit/public.ts`
- `src/adapters/spec-kit/workflow.ts`
- `src/adapters/pydantic-ai-spec/compiler.ts`
- `src/adapters/pydantic-ai-spec/types.ts`

Each operation must be reclassified independently. Exact source observation,
portable derivation and round trip are different operations. Native source
snapshots remain authoritative; a portable derivation can claim support only
for the exact semantics named by that operation. A request for unrepresentable
portable semantics must fail unsupported.

Primary tests:

- `tests/specifications/contracts.test.ts`
- `tests/specifications/public-api.test.ts`
- `tests/adapters/openspec/public.test.ts`
- `tests/adapters/ai-sdlc/public.test.ts`
- `tests/adapters/bmad/public.test.ts`
- `tests/adapters/spec-kit/public.test.ts`
- `tests/adapters/spec-kit/workflow-overlays.test.ts`
- `tests/adapters/spec-kit/workflow-validation.test.ts`
- `tests/adapters/pydantic-ai-spec/public.test.ts`
- `tests/adapters/pydantic-ai-spec/semantic-boundaries.test.ts`
- `tests/specification-compiler/compiler.test.ts`

## Runtime adapter findings

`src/adapters/runtimes/pydantic-ai-support.ts` declares
`RuntimeSemanticDisposition` as `supported | projected | unsupported` and calls
normalized events, caller-managed history and cross-language output
projections supported compatibility evidence.

Affected modules:

- `src/adapters/runtimes/public.ts`
- `src/adapters/runtimes/pydantic-ai-support.ts`
- `src/adapters/runtimes/pydantic-ai.ts`
- `tests/conformance/pydantic-ai-compatibility.test.ts`

The correction replaces `projected` support with exact operation identifiers.
Native event, session and state operations remain native; a distinct portable
operation is supported only when its complete declared semantics are tested.
The replacement matrix also distinguishes an unsupported applicable operation
from a `not-applicable` operation absent from the exact runtime contract.

`runtime-temporal-reference` writes the shared runtime-conformance guidance and
inherits this matrix. It therefore depends on
`runtime-operation-contract-correction` as well as the architecture correction,
so Temporal qualification cannot race or redefine the shared runtime contract.

## Protocol impact

No production code exists under `src/adapters/protocols`. The proposed
`adapters-protocol-qualification` task is therefore the enforcement point:

- A2A uses the recognised A2A SDK and preserves A2A identity, task, delegation,
  event and failure contracts;
- MCP uses the recognised MCP SDK and preserves MCP tool, resource, lifecycle
  and error contracts; and
- kernel control wraps effects without replacing either protocol contract.

## Correct fail-closed behaviour

The correction does not remove legitimate unsupported dispositions. The
following existing boundaries already reject semantics they cannot preserve
and should remain positive controls:

- retrieval rejects non-text or unsupported structured-query semantics;
- media rejects unresolved resources or unsupported formats;
- storage adapters reject unsupported native message content;
- UI adapters reject unsupported content parts; and
- capability claims may explicitly state `unsupported`.

These paths need terminology review only if they also return a narrowed success.

## Public documentation ownership

ADR-017 is accepted. Each affected page has one correction writer and a
receiving check:

| Writer task                                 | Public pages                                                                                                                                                | Required verification                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `architecture-external-contract-fidelity`   | `docs/index.md`, `docs/adapters/index.md`, `docs/orchestration/index.md`                                                                                    | `bun run docs:check`, `bun run docs:build`, documentation tests and `git diff --check`               |
| `adapter-ai-sdk-native-contract-correction` | `docs/adapters/ai-sdk.md`                                                                                                                                   | AI SDK fixture suite, package typecheck/build/qualification, documentation build and formatting      |
| `specification-exact-operation-contracts`   | `docs/guide/core-concepts.md`, `docs/reference/api.md`, `docs/reference/migration-2.md`, `docs/reference/package-exports.md`                                | specification and five adapter suites, package typecheck/build/qualification and documentation build |
| `runtime-operation-contract-correction`     | `docs/adapters/runtime-conformance.md`, `docs/guide/agent.md`, `docs/guide/workflow.md`, `docs/orchestration/workflows.md`, `docs/reference/conformance.md` | runtime conformance suite, package typecheck/build, documentation build and formatting               |

The generic pages are architecture guidance and can change when the accepted
operation policy is frozen. Integration-specific pages change with their owning
implementation so they cannot claim behaviour before its fixtures pass.

The parent `architecture-external-contract-fidelity` task also owns the current
architecture authority corrections in `PLAN.md` and `LANGUAGE.md`. Those files
must describe exact operation dispositions rather than preservation/loss or
conversion-report vocabulary. `specification-exact-operation-contracts` owns
the implementation-specific `SPECIFICATIONS.md` correction alongside the
specification code, while runtime and provider adoption pages remain with their
respective implementation tasks.

## Task decomposition

- `architecture-external-contract-fidelity` freezes the replacement contract,
  generic public guidance and downstream allocation after human acceptance of
  ADR-017; downstream code outcomes are not its acceptance criteria.
- `adapter-ai-sdk-native-contract-correction` repairs the published AI SDK
  adapter and any required native model surface.
- `specification-exact-operation-contracts` replaces conversion-fidelity
  contracts and corrects the five implemented specification adapters.
- `runtime-operation-contract-correction` replaces projected runtime support in
  the existing PydanticAI compatibility proof.
- Future runtime and protocol tasks depend on the architecture correction and
  `runtime-operation-contract-correction` before consuming its operation matrix
  or writing the shared runtime-conformance page. This orders LangGraph,
  PydanticAI, Strands, Temporal, protocol qualification and runtime
  substitution after the current matrix correction; release work that writes
  the same conformance page inherits the same dependency.

Fourteen proposed task contracts were corrected during this assessment:

- `adapters-protocol-qualification`
- `adapter-langgraph-runtime`
- `adapter-pydantic-ai-runtime`
- `adapter-pydantic-ai-semantic-projection`
- `adapter-strands-runtime`
- `adapter-strands-runtime-release`
- `runtime-adapter-substitution`
- `runtime-temporal-reference`
- `adapter-coding-agent-integration`
- `integrations-connector-characterization`
- `integrations-connector-contracts`
- `specification-semantic-path-characterization`
- `specification-semantic-reconciliation`
- `specification-cross-adapter-conformance`

Completed task logs remain historical evidence. Their loss-accounting clauses
are not rewritten as if they had never existed; ADR-017 and these correction
tasks supersede them prospectively.
