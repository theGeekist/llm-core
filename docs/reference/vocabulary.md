# Vocabulary

`llm-core` gives portable values and live values different names. A portable
value is JSON-compatible and safe to validate, store, or send. A live value
holds behavior or a handle to work executing now.

## Agents

| Term                | Meaning                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AgentSpec`         | Portable agent intent: identity, version, instructions, effect requirement, metadata, and skill references.  |
| `PreparedAgentSpec` | A spec prepared and branded by one compatible runner.                                                        |
| `AgentRunner`       | Port that reports capabilities, prepares specs, and starts or resumes runs.                                  |
| `AgentRun`          | Live handle exposing `AgentRunEvent` values, cancellation or intervention controls, and one terminal result. |
| `RunResult`         | Terminal result: `completed`, `failed`, `denied`, or `cancelled`.                                            |
| `AgentRunEvent`     | Typed event family for an agent run. It is distinct from controlled-effect evidence.                         |

## Workflows

| Term                       | Meaning                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `WorkflowDefinition`       | Ordered executable steps owned by application orchestration.                          |
| `ExecutableWorkflowStep`   | Passive workflow step with an explicit key, `effect: "none"`, and execution behavior. |
| `ResumableWorkflowStep`    | Passive or meaningful step accepted by authenticated durable intervention resume.     |
| `WorkflowExecutionOutcome` | Result of running or resuming a workflow: `completed`, `paused`, or `failed`.         |
| `WorkflowPauseSnapshot`    | Ephemeral workflow pause state accepted by the ordinary resume path.                  |
| `WorkflowResumeOutcome`    | Result of authenticated durable intervention resume.                                  |

A recipe may be an application pattern or a preconfigured workflow in your own
code. It is not a public llm-core type or package export.

## Models and tools

| Term                             | Meaning                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ModelRef`                       | Logical model selection intent, separate from provider, deployment, endpoint, and credentials. |
| `ModelRequest` / `ModelResponse` | Provider-neutral portable model boundary.                                                      |
| `ModelProfile`                   | Input description of one model binding and its evidence-backed capabilities.                   |
| `RegisteredModelProfile`         | Validated, cloned, immutable profile accepted by the resolver.                                 |
| `ToolSpec`                       | Declared tool identity, schema, and execution semantics.                                       |
| `ToolCall` / `ToolResult`        | Portable request and result at the tool boundary.                                              |
| `BoundAction`                    | Canonical action document bound to authority, effects, and an exact digest.                    |

## Control and evidence

| Term                                   | Meaning                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `PolicyDecision`                       | Evidence-backed policy verdict for an exact action.                                                   |
| `ApprovalRequest` / `ApprovalDecision` | Authenticated decision boundary bound to an exact action and time window.                             |
| `InterventionRequest`                  | Structured request that hands control back during a run.                                              |
| `ExecutionEvent`                       | Redacted projection of one controlled tool-execution transition. It is not an agent event or a trace. |
| `EventSink`                            | Best-effort projection port. It is not authoritative storage.                                         |
| `ToolExecutionReceipt`                 | Durable storage-neutral lifecycle record for one controlled effect.                                   |

## State and durability

| Term                            | Meaning                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `LiveContinuation`              | Process-local handle. It is intentionally not portable.                                                 |
| `Snapshot`                      | Portable point-in-time observation with no resume guarantee.                                            |
| `ResumableCheckpoint`           | Portable runtime-owned checkpoint before registration.                                                  |
| `RegisteredResumableCheckpoint` | Validated checkpoint accepted for compatibility checking and resume.                                    |
| `ProviderSessionRef`            | Opaque continuity reference owned by a provider session.                                                |
| `DurableExecutionHandle`        | Reference to work whose history, timers, retries, and signals are owned by an external durable runtime. |

## Context, artifacts, and evaluation

| Term                            | Meaning                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ContextEntry`                  | Portable context item with scope, provenance, priority, cost, and closed content.               |
| `ContextManifest`               | Immutable context selection with explicit budget accounting and derived identity.               |
| `Artifact`                      | Portable output identity, integrity, content reference, and provenance.                         |
| `ArtifactRef`                   | Stable reference to an artifact without a physical locator.                                     |
| `EvaluationCase`                | Immutable evidence-bound subject and criteria for evaluation.                                   |
| `EvaluationEvaluatorDescriptor` | Portable evaluator identity and version.                                                        |
| `EvaluationResult`              | Deterministically ordered judgements stamped from the validated case and registered evaluators. |

## Bindings and interaction

| Term                    | Meaning                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Capability binding      | Evidence-backed portable descriptor paired with an exact immutable live port facade.                                      |
| `InvocationContext`     | Portable identity and authority passed separately through a capability port.                                              |
| `InteractionEvent`      | Closed union of agent, controlled-execution, and registered content events accepted by interaction projection.            |
| `InteractionProjection` | Deterministic state reduced from ordered interaction events.                                                              |
| `InteractionSession`    | Application service that reserves conversation revisions, starts runs, persists snapshots, and exposes projection events. |

## Boundaries

| Term              | Meaning                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Capability        | Stable contract and behavior owned by core.                                                                |
| Qualified adapter | Explicit integration subpath that maps native values to a core contract or projects core events to a host. |
| Contract          | Typed portable shape at a process, runtime, storage, or integration boundary.                              |

Qualify broad nouns such as Context, State, Memory, Runtime, Profile, Result,
and Thread so the name identifies its exact lifetime and owner.
