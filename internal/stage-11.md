# Stage 11: Paused/Resume Mechanics (Internal Driver)

## Context

Paused outcomes represent an indefinite wait, not just HITL. Real workloads pause for external batch jobs,
long-running retrievers, or async orchestration. The current flow works but lacks a way to describe _why_
we paused and has no internal execution model for long waits.

Generators are a great internal fit for “pause → resume → continue”, but they should never leak into the
public surface. `run()` / `resume()` must stay `MaybePromise` so sync workflows remain sync.

## Goals

- Keep the public API as `run()` / `resume()` with `paused` outcomes (no generator surface).
- Add internal pause metadata (kind + reason) for trace/diagnostics.
- Make resume adapters aware of why a run paused.
- Support long-wait orchestration without changing existing recipe contracts.

## Decisions (from discussion)

- Expose `pauseKind` **internally only** (trace + diagnostics).
  - If we ever need it on outcomes, use `Outcome.meta.pauseKind` (no new top-level field).
- Resume adapters **do** receive `pauseKind` (optional).
- The pipeline signal remains `{ paused: true, token, partialArtifact? }` (no new shape).

## Deliverables

1. `PauseKind` (internal type)

   - `"human" | "external" | "system"`
   - Added to trace data for `run.paused`.
   - Included in pause-related diagnostics.

2. Resume adapter request metadata

   - Add `pauseKind?: PauseKind` to `AdapterResumeRequest`.
   - Pass through from runtime when a run pauses.

3. Internal execution driver (no public API change)

   - Accepts either a direct pipeline result **or** a generator yield.
   - Normalizes into the existing outcome union (`ok | paused | error`).
   - Owns pause → resume transitions and preserves `MaybePromise`.

4. Documentation updates
   - Emphasize paused = indefinite wait, not “needs human”.
   - Document `pauseKind` as trace/diagnostics metadata.
   - Keep public API examples generator-free.

## Notes

- Generators are strictly internal; no generator types in public docs or exported types.
- `pauseKind` is optional and non-breaking.
- `runtime.resume.resolve(...)` remains the single escape hatch for resuming.
- Generator continuations are in-memory only; resume-time adapter/provider overrides are not applied.
- Pause tokens are strict: a token must map to an in-memory session or a stored snapshot.
- Durable resume requires a session store; without it tokens are process-local.
- Pause sessions are kept in memory without TTL; long-running processes with many paused runs should add a cleanup strategy later.
