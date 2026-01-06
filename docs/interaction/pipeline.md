---
title: Interaction Pipeline
---

# Interaction Pipeline

The interaction pipeline is a resumable pipeline that runs **packs** of interaction steps. It ships
with a minimal core pack and lets you add your own steps.

---

## 1) Default steps (simple → advanced)

`createInteractionPipelineWithDefaults()` registers a small core pack:

- `capture-input` (adds the user message)
- `run-model` (runs the model, streams if supported)
- `run-tools` (placeholder for tool execution)

You can start here and layer in post-processing later.

---

## 2) Add a custom step pack

This example adds a post-process step after the model run.

<<< @/snippets/interaction/custom-pack.js#docs

Notes:

- Cross-pack dependencies must be **fully qualified** (e.g. `interaction-core.run-model`).
- Step keys are deterministic and sorted by pack + step name.

---

## 3) Streaming vs non-streaming

If the model adapter exposes `stream()`, the pipeline consumes its stream and reduces events as they
arrive. If it does not, the pipeline synthesizes a minimal stream from the final result and reduces
that.

The state shape is identical in both paths.

---

## 4) Pause/resume

The interaction pipeline is built on `makeResumablePipeline`. To request a pause from a step,
set `state.private.pause` (or use `requestInteractionPause`). The run will return a paused snapshot.
Resume with `pipeline.resume(snapshot, resumeInput)` and continue from the pause point.
