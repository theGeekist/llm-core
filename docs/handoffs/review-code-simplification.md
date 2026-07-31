# Code simplification review handoff

## Responsibility

This handoff records the code and API simplification review: the reasoning used, the candidates examined, conclusions already applied, and the remaining review lens. It does not inventory public documentation, restate the current architecture defect, or prescribe repository execution.

For the live defect, read [the V2 architecture review](./review-v2-arch.md). For execution, read [the implementation handoff](./implement-v2-arch.md).

## Review premise

The project has no users and no historical compatibility obligation. Reviews therefore optimize for one coherent final design rather than preserving overloads, aliases, deprecated paths, serialized shapes, or earlier package behavior. External package and framework contracts remain real integration requirements and must be verified before changing dependent code.

The review rejected a blanket “functional code is complex” diagnosis. The useful distinction was between:

- functional composition that lets a value flow through stable transformations; and
- point-free-looking code that still rebuilds and manually threads context records between every step.

`MaybePromise`, currying, point-free functions, and composition remain intentional. Simplification means using them where they clarify flow and removing ceremony where they do not.

## Conclusions established

### Composition and exported functions

- Prefer exporting the final composed operation while keeping helpers private.
- Bind stable dependencies once at a factory or feature boundary, leaving a small unary operation for callers.
- Prefer `compose` and Kleisli `composeK`; a `pipeK` alias adds no capability and is not wanted merely for reading order.
- Use `composeK` for genuinely linear `A -> MaybePromise<B>` stages. It cannot eliminate a domain context that is needed by non-adjacent stages, branching, rollback, or finalization.
- Retain meaningful transition types. Remove input-record ladders whose only purpose is manual plumbing.

### Function arguments and boundaries

- For project-owned operations with several positional arguments, prefer one named input object when it improves call-site clarity, composition, and future evolution.
- Preserve protocol-mandated signatures for reducers, comparators, runtime methods, pipeline callbacks, and third-party adapters. Adapt or curry at the owned boundary instead of changing an external contract.
- Verify repository call sites and dependent integrations before changing variance or argument shape. `AgentLoopConfig`, session resume, and similar familiar-looking signatures require dependency evidence before simplification.

### Compatibility and functional surface

- Remove inferior APIs and update all call sites in the same change; do not keep dual signatures or compatibility shims.
- Keep the functional basis small and evidence-driven. Do not maintain multiple curry/partial/composition helpers without distinct use cases.
- Functional helpers may remain internal even when the implementation style is functional. Public exposure is a product-language decision, not validation of the implementation style.

## Candidates reviewed and resulting direction

### Agent run and stream

Run and stream differed primarily by streaming configuration. They were suitable for one parameterized private implementation bound into the exported runtime. They were **not** a good `composeK` example because run context is consumed at non-adjacent points; forcing a linear pipeline would reintroduce a context bag.

### Run-handler construction

Workflow dependencies derived entirely from creation-time dependencies should be built once in the `createRunHandler` closure. Only request-specific error handling, context, and trace data should remain per invocation.

### Stateful UI mappers

Options should be bound into a mapper once, producing an event-to-chunks function that reuses the same mapper across events. Recreating a mapper inside the event callback discards cross-event state and is a correctness bug disguised as convenience. This applies to the AI SDK mapper and its assistant-ui and ChatKit counterparts; protocol callbacks themselves should keep their required signatures.

### Recipe and wrapper boilerplate

Repeated recipe/pack declarations and structurally identical runtime wrappers are consolidation candidates when their differences can be represented as data or bound configuration. The abstraction should replace repetition without hiding different lifecycle or effect semantics.

### Over-applied composition

The former `run-tools` mapping pipeline demonstrated that composition can become ceremony: multiple aliases and builder functions expressed a two-step transformation. Small local `maybeMap` composition is preferable when it preserves the same sync-or-async behavior with less scaffolding.

### Resume and workflow paths

Resume was deliberately reviewed last. It contains branching, early outcomes, pause/rollback semantics, state ownership, and external dependency signatures. Composition may simplify linear subsegments, but a wholesale point-free rewrite is not justified without complete call-site and dependency analysis.

## Review lens for future passes

Review future candidates in this order:

1. identify the true owner of each argument and piece of state;
2. inspect every repository call site and any external signature involved;
3. distinguish a linear transformation from branching orchestration or a protocol callback;
4. bind stable data once and compare the resulting public and private APIs;
5. remove aliases, overloads, builders, and intermediate records that no longer carry meaning;
6. verify `MaybePromise`, streaming, pause/resume/rollback, adapter, and effect semantics with focused tests; and
7. compare SLOC only after the design is clearer—line reduction is evidence, not the objective.

Promising recurring targets include workflow run/resume subsegments, interaction-step execution, recipe definitions, runtime wrappers, duplicate diagnostic factories, comparators, reducer branches, run/stream variants, and identity getters. Each remains a candidate until usage evidence proves consolidation is safe.

## Non-negotiable guardrails

- No legacy compatibility surface unless explicitly requested.
- No `pipe`/`pipeK` alias solely to reverse composition order.
- No conversion of `MaybePromise` architecture into always-async flows.
- No forced point-free rewrite of branching or protocol-shaped code.
- No signature change to externally constrained code without checking the dependency and all call sites.
- No abstraction justified only by a repository-wide count; inspect representative implementations first.
