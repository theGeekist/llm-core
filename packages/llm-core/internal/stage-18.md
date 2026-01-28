# Stage 18 — Pipeline Pause/Resume Core

Status: complete.

Goal: Move generator-based pause/resume semantics into `@wpkernel/pipeline` without changing
standard-pipeline usage or requiring downstream migrations.

## Hard Constraint

- Standard-pipeline remains blissfully unaware. No code changes required in consumers that call
  `makePipeline(...).run(...)`.
- Pause is fully opt-in at the pipeline level. Generator-driven execution must be internal and
  invisible unless the opt-in is enabled.

## Summary

Introduce an internal pause primitive and resume driver inside pipeline core. Expose it as an
optional capability (new API surface) while keeping the existing `run()` behavior and result types
unchanged for standard usage.

## Detailed Sketch (internal refactor + optional public exposure)

### 1) Internal pause types (runner-level, not public)

Add internal types alongside `Halt` so stages can stop execution without throwing.

```ts
// pipeline/src/core/runner/types.ts (internal)
export type PauseSnapshot<TState> = {
  stageIndex: number;
  state: TState;
  token?: unknown;
  pauseKind?: "human" | "external" | "system";
  createdAt: number;
  payload?: unknown;
};

export type PipelinePaused<TState> = {
  __paused: true;
  snapshot: PauseSnapshot<TState>;
};

export type PipelineStepResult<TState, TRunResult> =
  | TState
  | PipelinePaused<TState>
  | Halt<TRunResult>;
```

### 2) Add pause signal to stage env (internal only)

Stages need a safe way to pause without mutating external state.

```ts
// pipeline/src/core/runner/types.ts
export type StageEnv<...> = {
  halt: (error?: unknown) => Halt<TRunResult>;
  pause: (options?: {
    token?: unknown;
    pauseKind?: "human" | "external" | "system";
    payload?: unknown;
  }) => PipelinePaused<TState>;
  // existing fields...
};
```

### 3) Runner becomes iterative (not composeK)

Replace `composeK` with a stage loop that can pause mid-run. The stage index becomes part of the
pause snapshot so resume can continue deterministically.

```ts
// pipeline/src/core/runner/program.ts (internal)
const stages = dependencies.stages(deps);

return async function run(initial: RunnerState) {
  let state = initial;
  let stageIndex = state.stageIndex ?? 0;

  while (stageIndex < stages.length) {
    const next = await stages[stageIndex](state);
    if (isHalt(next)) return next;
    if (isPaused(next)) return next;
    state = next;
    stageIndex += 1;
  }
  return state;
};
```

### 4) Snapshot includes rollback + extension state

Pipeline already tracks rollbacks and extension lifecycle state. These must be captured in the
pause snapshot to preserve transactional behavior on resume.

- `helperRollbacks`
- `extensionState`
- `extensionStack`

### 5) Resume API (optional, public)

Add a new method without altering `run()`:

```ts
type ResumablePipeline = AgnosticPipeline & {
  resume?: (
    snapshot: PauseSnapshot<AgnosticState>,
    resumeInput?: unknown,
  ) => MaybePromise<TRunResult>;
};
```

Expose as either:

- `makeResumablePipeline(...)` (new export), or
- `makePipeline(..., { supportsPause: true })` (adds `resume` only when enabled).

Opt-in behavior requirements:

- Without opt-in, stages must never see `pause()` and runs must never return paused outcomes.
- With opt-in, stage execution may return `PipelinePaused` snapshots, and `resume()` becomes
  available.

### 6) Standard-pipeline stays unchanged

- No change to `makePipeline` return type for default usage.
- No change to standard stage composition or helper signatures.
- Existing consumers continue to receive `TRunResult` only.

## File Map

Pipeline changes:

- `pipeline/src/core/runner/types.ts` (add pause types + stage env pause)
- `pipeline/src/core/runner/program.ts` (iterative stage runner)
- `pipeline/src/core/runner/execution.ts` (handle paused return path)
- `pipeline/src/core/makePipeline.ts` (optionally expose resume API)

Epipe runtime changes (follow-up stage):

- Remove `ExecutionIterator` driver path and map pipeline pause snapshots to workflow outcomes.

## Implementation Steps

- [x] Add internal pause types and `pause()` to `StageEnv` (pipeline core, shipped in
      `@wpkernel/pipeline@1.1.0`).
- [x] Refactor runner program to iterative stage execution (pipeline core).
- [x] Add pause snapshot creation with stage index and rollback state (pipeline core).
- [x] Add resume entrypoint (new export or feature flag; implemented as `makeResumablePipeline`).
- [x] Keep standard-pipeline run path identical for non-paused runs (standard-pipeline unchanged).
- [x] Add unit tests: pause mid-stage, resume continues, rollback behavior preserved (pipeline).
- [x] Update pipeline README with pause/resume optional API.

## Epipe Scope of Work (follow-up)

- [x] Replace iterator-driven pause handling in `src/workflow/driver/*` with pipeline pause
      snapshots.
- [x] Map `PipelinePaused` to workflow paused outcomes in `src/workflow/runtime/outcomes.ts`.
- [x] Remove `ExecutionIterator` path from `src/workflow/runtime/run-runner.ts`.
- [x] Update resume session storage to persist the pipeline pause snapshot (token + pauseKind +
      payload).
- [x] Keep diagnostics + trace semantics unchanged.

## Integration Notes (epipe)

- `src/workflow/pause.ts` centralizes pause snapshot detection and pauseKind narrowing.
- Resume now prefers pipeline snapshots when present; falls back to normal run when absent.
- Pause rollbacks read from pipeline pause snapshots, preserving helper rollback state.

## Risks

- Stage execution order must remain deterministic after switching from `composeK`.
- Resume must not re-run already-completed stages.
- Rollback stacks must remain valid after resume (no duplication).

## Testing

- Unit tests for pause/resume in pipeline core (no standard-pipeline changes).
- Regression tests for existing standard-pipeline behavior.
