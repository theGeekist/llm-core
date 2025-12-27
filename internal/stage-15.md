# Stage 15 — Interrupt Parity + Rollback Semantics

Status: in progress.

## Context

We already support pause/resume, generators, and durable sessions, but we do not
explicitly model interrupt semantics (restart vs continue) or use pipeline
rollback for pause flows. LangGraph and LlamaIndex workflows expose explicit
interrupt/checkpoint and event-stream semantics that we can approximate without
changing the public surface.

This stage defines the gaps and alignment work needed to support “HITL-style
interrupts with restart” and “event-centric workflows” while preserving DX.

## Why this is a real implementation gap

- Pipeline rollback already exists and is wired for errors, but we never invoke
  rollback during pauses.
- Recipe steps do not provide a rollback helper, which makes it awkward to use
  the pipeline’s rollback API directly from recipes.
- Resume semantics are “continue in place” only; there is no explicit control
  over restart behavior.
- Event-driven workflows can be modeled today, but there is no standard recipe
  convention for event emission/consumption.

## Findings (from package investigation)

### LangGraph (@langchain/langgraph + @langchain/langgraph-checkpoint)

- Interrupts are raised dynamically (`interrupt()`), persist state via a
  checkpointer, and resume via `Command({ resume })` + `thread_id`.
- Resume restarts the node from the beginning; interrupt order is significant.
- Checkpointer controls durable execution and is required for interrupt.

### LlamaIndex Workflows (@llamaindex/workflow-core)

- Workflows are event-driven with a typed event stream (`WorkflowEvent`,
  `WorkflowStream`) and middleware that can add state, validation, and tracing.
- Middleware provides trace events and stateful contexts.

### Our current runtime

- Pause/resume is token-based and continues execution in place (generator).
- No explicit “restart step” semantics.
- No event stream API; we rely on pipeline state + trace events.

## Packages installed for investigation

- `@langchain/langgraph`
- `@langchain/langgraph-checkpoint`
- `@llamaindex/workflow-core`
- `@llamaindex/workflow`

## Pipeline rollback primitives (current)

- Helpers can return a `rollback` via `HelperApplyResult`.
- Pipeline runner supports helper rollback + extension rollback.
- Public API: `createPipelineRollback` from `@wpkernel/pipeline`.
- Our code references rollback only in examples, not in recipe/runtime flows.

## Gaps

### 1) Pause semantics are underspecified

- We do not express a “restart step on resume” mode.
- Pipeline rollback is only used for errors; pauses don’t trigger rollback.
- HITL semantics therefore behave as “resume in place,” which diverges from
  LangGraph’s restart-on-resume model.

### 2) No recipe-level state schema

- PipelineState is intentionally loose.
- Recipes do not currently provide a way to define/validate state shape.

### 3) No event-stream workflow surface

- We can model events in state or trace, but there is no dedicated event
  channel equivalent to LlamaIndex’s `WorkflowStream`.

### 4) Token vs thread ID

- LangGraph uses caller-defined `thread_id` as the persistent cursor.
- Our runtime uses opaque tokens only; there is no optional “resume key”
  / deterministic thread ID concept.

### 5) Rollback API is underused

- Pipeline supports rollback (`createPipelineRollback`), but recipes/steps
  do not currently expose a first-class rollback hook or helper.

## Alignment Work (Proposed)

### 0) Alignment first (interop shapes)

Align on the orchestration interop shape before parity work:

- Shared adapter nouns for orchestration:
  - `checkpoint` / `sessionStore`
  - `interrupt`
  - `eventStream`
  - `trace` (orchestration events)
- Keep these adapter-first and optional; no new core constructs.

These define the contracts parity work will implement.

Current surfaces we can align against:

- Pause/resume runtime: `src/workflow/runtime/*`, `src/workflow/driver/*`
- Session store: `src/workflow/runtime/resume-session.ts`
- Cache-backed persistence: `src/adapters/primitives/cache.ts`
- Trace sink: `src/adapters/types/core.ts` + `src/adapters/langchain/trace.ts`

Alignment map (no behavior change yet):

- `checkpoint` / `sessionStore`
  - Existing: `SessionStore` (get/set/delete/touch/sweep).
  - Proposed adapter surface: `CheckpointStore` that wraps or exposes `SessionStore`.
  - Registry: optional adapter that can override cache-based persistence.
- `interrupt`
  - Existing: `pauseKind` + paused outcomes + resume adapter.
  - Proposed adapter surface: `InterruptStrategy` (continue vs restart) + optional metadata.
  - Registry: optional adapter; default = continue.
- `eventStream`
  - Existing: `AdapterTraceEvent` + trace sink + pipeline lifecycle events.
  - Proposed adapter surface: `EventStream` (append-only stream with typed events).
  - Registry: optional adapter; default = trace-only events.
- `trace`
  - Existing: `AdapterTraceSink`.
  - Proposed: extend to accept orchestration events (pause/restart/rollback).

**Completion summary (fill as work lands):**

- Status: completed (interop shapes landed).
- Notes: Added orchestration adapter types (checkpoint/eventStream/interrupt), registry wiring, and capability
  presence flags; added LangGraph checkpointer + LlamaIndex event stream adapters; documented AdapterBundle update.

### 1) Parity second (AI SDK + LC + LI)

Implement the aligned interop shapes across ecosystems:

- AI SDK:
  - Cache / store / memory semantics used by resume persistence.
  - Streaming + telemetry parity for long-running jobs.
  - Transport resume bridge (UI streaming / resumable streams) without owning transport.
- LangChain + LlamaIndex:
  - Cache + trace consistency to ensure resume diagnostics are stable.
  - Orchestration adapters mapped to their ecosystem constructs.

**Completion summary (fill as work lands):**

- Status: in progress
- Notes: KV-store cache TTL enforced via metadata; added orchestration adapter surfaces plus LangGraph checkpointer
  and LlamaIndex workflow event stream adapters; capability flags cover checkpoint/eventStream/interrupt.

### 2) New constructs last (orchestration adapters)

Build the orchestration adapters after parity is in place:

- `checkpoint` / `sessionStore` adapter:
  - LangGraph checkpointer parity (thread_id semantics).
  - Resume persistence for long‑wait workflows.
- `interrupt` adapter:
  - Pause strategy (`continue` vs `restart`) driven by adapter config.
  - Allows LangGraph‑style “restart step on resume” without core changes.
- `eventStream` adapter:
  - LlamaIndex workflow‑core event stream parity.
  - Standardized event emission/consumption for recipes.
- `trace` adapter:
  - Extend to include orchestration events and event stream metadata.

**Completion summary (fill as work lands):**

- Status: in progress
- Notes: Orchestration adapters are implemented; interrupt strategy wiring + recipe/event conventions remain.

### 3) Rollback + pause semantics (runtime)

After parity + orchestration adapters, fix pause/resume semantics and rollback usage:

- Add explicit pause strategy (`continue` vs `restart`).
- Invoke rollback stack on pause when strategy is `restart`.
- Ensure diagnostics and trace include pause metadata.

**Completion summary (fill as work lands):**

- Status:
- Notes:

### 4) Recipes (last)

Only after adapters + rollback are stable:

- Expose rollback helpers at the recipe step layer.
- Add optional recipe state schemas.
- Add event-stream conventions for LlamaIndex parity.

**Completion summary (fill as work lands):**

- Status:
- Notes:

### A) Explicit pause strategy

Add an internal pause strategy for steps/packs:

- `continue` (current behavior): resume in place.
- `restart` (HITL-like): rollback the current step and re-run from start.

Implementation sketch:

- Step result supports `rollback` already via `HelperApplyResult`.
- On pause, runtime checks whether the current step requests `restart`.
- If so, run rollback stack for that step before returning paused outcome.

Concrete work:

- Add a pause strategy flag to step specs (internal only).
- Record the active step key on pause so rollback can target the correct helper.
- Ensure rollback uses MaybePromise helpers (no raw Promise usage).

### B) Step-level rollback helpers

- Provide a small helper for recipes to return rollback functions without
  touching pipeline internals.
- Example: `step.rollback(fn)` or `createStepRollback(...)`.

Concrete work:

- Extend `Recipe.step(...)` builder to accept rollback hooks.
- Use `createPipelineRollback` internally so recipe authors don’t touch pipeline.

### C) Optional state schema (recipe-level)

- Let a recipe define a state contract (value-first, optional).
- Use it for validation + trace annotation, not for public generics.

Concrete work:

- Add `Recipe.flow(...).state(schema | validator)` (value-first).
- Emit diagnostics on invalid state; attach summary to trace.

### D) Event stream conventions

- Provide a light “event channel” helper:
  - `state.events` array (or stream-like emitter) with helpers to append/consume.
  - Trace should capture event emissions for observability.
- This approximates LlamaIndex workflow event semantics without new runtime APIs.

Concrete work:

- Introduce a small `events` helper module for append/consume.
- Add a standard trace event when events are emitted.

### E) Deterministic resume keys (optional)

- Allow runtime to accept an optional `resumeKey` to map to tokens in the
  SessionStore.
- This mirrors LangGraph `thread_id` without changing the default token flow.

Concrete work:

- Extend resume adapter input to accept `resumeKey?: string`.
- Map `resumeKey` to token in session store (if provided).

## Tests

- Pause with restart: ensure rollback runs and step restarts on resume.
- Pause with continue: ensure rollback does not run and state is preserved.
- State schema validation: diagnostics emitted on invalid state.
- Event channel: event emission appears in trace + diagnostics.
- Resume key: tokens resolve deterministically when configured.

## Docs

- Add a “Pause Semantics” section (continue vs restart) to runtime docs.
- Clarify rollback usage for HITL and long-wait workflows.
- Update interop audit to note parity with LangGraph interrupts (semantics).

## Implementation map (files to touch)

- `src/recipes/flow.ts` (step builder, rollback helpers, pause strategy)
- `src/workflow/runtime/resume-*` (pause handling + restart semantics)
- `src/workflow/runtime/run-runner.ts` (pause path hooks)
- `src/workflow/runtime/outcomes.ts` (pause metadata)
- `src/workflow/driver/*` (if pause strategy needs session metadata)
- `src/adapters/ai-sdk/*` (cache/memory/stream/telemetry parity)
- `src/adapters/langchain/*` (cache/trace parity for resume)
- `src/adapters/llamaindex/*` (cache/trace parity for resume)
- `docs/reference/runtime.md` (pause semantics)
- `docs/reference/workflow-api.md` (resume semantics)
- `docs/reference/interop-audit.md` (LangGraph parity notes)
