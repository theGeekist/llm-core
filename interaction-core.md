• Yes — and the code already supports that direction. The interaction layer can be powered by a pipeline, not the workflow runtime, because
the pipeline is already the “neutral execution core” and can run without recipes/runtime glue.

Here’s how that maps to existing constructs:

What you already have

- Pipeline engine (framework‑agnostic): @wpkernel/pipeline/core is what src/workflow/runtime.ts wraps, but it’s independent.
- Pipeline helpers + state: src/workflow/pipeline.ts + src/recipes/flow.ts already define a step system and structured state progression.
- Trace + diagnostics are pipeline‑level, not runtime‑level: TraceEvent (src/workflow/trace.ts) and DiagnosticEntry (src/workflow/
  diagnostics.ts).

How a pipeline can power interaction core
You can define an InteractionPipeline that runs directly against adapters, with a state reducer that produces UI state:

- Pipeline state = InteractionState
  - store messages, events, diagnostics, trace in pipeline state.
  - reuse Message types (src/adapters/types/messages.ts).
- Pipeline steps = interaction stages
  - captureInput (append user message)
  - runModel (model adapter call; stream into Message parts)
  - runTools (tool calls; append tool results)
  - postProcess (summaries, RAG citations)
  - emitEvents (via EventStream; see src/recipes/events.ts)
- Streaming
  - Model stream events already normalized (ModelStreamEvent, QueryStreamEvent).
  - Pipeline step can reduce those into message deltas.
- Pause/Resume
  - Pipeline helpers already support pause + rollback semantics via \_\_interrupt (src/workflow/runtime/pause-metadata.ts).
  - This can be used without the runtime if you implement a minimal driver.

Why this matches “not tied to runtime”

- The runtime is just a resolver + executor for pipelines.
- You can call the pipeline directly with adapters, and still use trace/diagnostics/event stream hooks.

What the interaction core layer should be (pipeline‑backed)

- A pipeline definition that consumes adapters and yields a UI‑ready state snapshot.
- A projection reducer that turns stream events into InteractionState.
- An optional driver that runs/persists pause/resume snapshots (checkpoint adapter).

If you want, I can sketch a minimal InteractionPipeline using the existing pipeline helper API so it stays runtime‑agnostic while reusing
adapters, trace, diagnostics, and event streams exactly as they exist today.
