# Workflows

A `WorkflowDefinition` is an ordered list of passive steps. Each step receives
the current state, an optional resume input, and its attempt number. It returns
either the next state or a pause.

<<< @/snippets/v2/workflow-composition.ts

`runWorkflow` and `resumeWorkflow` preserve `MaybePromise` behavior. A fully
synchronous definition can complete synchronously; asynchronous steps can
return promises without changing the contract.

## Execution lifecycle

```mermaid
stateDiagram-v2
  [*] --> Running: runWorkflow
  Running --> Running: continue
  Running --> Retrying: step throws and retry allows
  Retrying --> Running: next attempt
  Running --> Paused: pause
  Paused --> Running: resumeWorkflow
  Running --> RollingBack: step fails
  RollingBack --> Failed
  Running --> Completed: no steps remain
  Completed --> [*]
  Failed --> [*]
```

The terminal `WorkflowExecutionOutcome` is one of:

| Status      | Carries                                            |
| ----------- | -------------------------------------------------- |
| `completed` | Final state and completed step keys                |
| `paused`    | An ephemeral `WorkflowPauseSnapshot`               |
| `failed`    | The failing step, error, and any rollback failures |

## Pause and resume

A paused transition chooses one of two rollback modes:

- `retain` keeps completed steps and resumes the paused step with the supplied
  resume input.
- `restart` rolls completed steps back in reverse order and resumes at step
  zero.

The snapshot records `durability: "ephemeral"` and `checkpoint: false`.
`resumeWorkflow` verifies the workflow identity, version, and completed-step
prefix before it continues. Use the durable intervention path when a decision
or meaningful effect must survive a process boundary.

## Retry and rollback

`WorkflowRetryPolicy.maxAttempts` counts the initial call. `shouldRetry`
controls which errors qualify, while `delayMs` may be a fixed delay or a
function of the error and attempt.

When a step ultimately fails, the runtime invokes rollback handlers for
completed steps in reverse order. Rollback failures are reported with the
original failure rather than hiding it.

## Identity and registration

`defineWorkflow` validates non-empty workflow identity and version plus unique,
non-empty step keys. `createWorkflowRegistry` stores definitions by workflow
identity and rejects accidental replacement. Use an explicit
`{ replace: true }` only when the composition root intends to replace a
registration.
