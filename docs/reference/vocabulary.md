# Vocabulary

`llm-core` gives portable values and live values different names. A portable
value is JSON-compatible and safe to validate, store, or send. A live value
holds behavior or a handle to work executing now.

This page describes the currently shipped contracts. Not every public type
belongs to ordinary application usage:

| Level     | When you need it                                       | Typical language                                                    |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Common    | Describe portable intent and evidence                  | agent definition, tool, workflow intent, result, conversation state |
| Extension | Implement a runtime, store, adapter or safety boundary | runner, port, policy, receipt, checkpoint                           |
| Internal  | Understand core implementation mechanics               | binding provenance, registration, coordinator                       |

Current low-level composition APIs expose some extension types directly. Their
presence here does not mean every application owns their implementation. The
sections below document them precisely so you can identify where application,
runner, adapter and storage responsibilities differ.

## Agents

| Term                      | Meaning                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `AgentRun`                | Live handle exposing `AgentEvent` values, controls, and one terminal result.                      |
| `AgentResult`             | Terminal result: `completed`, `failed`, `denied`, or `cancelled`.                                 |
| `AgentEvent`              | Typed lifecycle event for one agent run. It is distinct from controlled-effect evidence.          |
| `AgentDefinition`         | Portable identity, instructions, requirements, metadata, and skills.                              |
| `PreparedAgentDefinition` | Definition prepared and provenanced by one compatible runner.                                     |
| `AgentRunner`             | Extension port that reports a profile, prepares definitions, starts runs, and may support resume. |
| `AgentRunnerProfile`      | Supported runtime behavior and optional controls.                                                 |
| `AgentStartRequest`       | Extension request containing a prepared definition, invocation context, and portable input.       |

## Workflows

| Term                           | Meaning                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `WorkflowExecutionPlan`        | Portable declarative workflow intent projected by an explicit runtime target.           |
| Native workflow                | Graph or durable workflow owned and executed by a qualified integration.                |
| `ControlledWorkflowStep`       | Meaningful runtime step executed only by authenticated durable intervention resume.     |
| `ControlledWorkflowStepResult` | State and authoritative effect record returned by a controlled runtime step.            |
| `ControlledWorkflowResult`     | Result of authenticated durable intervention resume, including reconciliation outcomes. |

A recipe may be an application pattern or a preconfigured workflow in your own
code. It is not a public llm-core type or package export.

## Models and tools

| Term                               | Meaning                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ModelRef`                         | Logical model selection intent, separate from provider, deployment, endpoint, and credentials. |
| `ModelRequest` / `ModelResponse`   | Provider-neutral portable model boundary.                                                      |
| `ModelProfile`                     | Input description of one model binding and its evidence-backed capabilities.                   |
| `RegisteredModelProfile`           | Validated, cloned, immutable profile accepted by the resolver.                                 |
| `Tool`                             | Ready common object created with `defineTool`.                                                 |
| `ToolConfig`                       | Common name, description, input contract, effect, and execute function.                        |
| `ToolDefinition`                   | Extension identity, registered schema, effects, and execution semantics.                       |
| `ExecutableTool`                   | Provenanced runtime tool that validates before execution.                                      |
| `ToolCall` / `ToolExecutionResult` | Portable request and result at the runtime tool boundary.                                      |
| `BoundAction`                      | Canonical action document bound to authority, effects, and an exact digest.                    |

## Control and evidence

| Term                                   | Meaning                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `PolicyDecision`                       | Evidence-backed policy verdict for an exact action.                                                   |
| `ApprovalRequest` / `ApprovalDecision` | Authenticated decision boundary bound to an exact action and time window.                             |
| `InterventionRequest`                  | Structured request that hands control back during a run.                                              |
| `ToolExecutionEvent`                   | Redacted projection of one controlled tool-execution transition. It is not an agent event or a trace. |
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
| `ContextSelection`              | Immutable context selection with explicit budget accounting and derived identity.               |
| `Artifact`                      | Portable output identity, integrity, content reference, and provenance.                         |
| `ArtifactRef`                   | Stable reference to an artifact without a physical locator.                                     |
| `EvaluationCase`                | Immutable evidence-bound subject and criteria for evaluation.                                   |
| `EvaluationEvaluatorDescriptor` | Portable evaluator identity and version.                                                        |
| `EvaluationResult`              | Deterministically ordered judgements stamped from the validated case and registered evaluators. |

## Bindings and interaction

| Term                    | Meaning                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Capability binding      | Evidence-backed portable descriptor paired with an exact immutable live port facade.                                         |
| `InvocationContext`     | Portable identity and authority passed separately through a capability port.                                                 |
| `ConversationEvent`     | User-facing event projected from canonical interaction facts.                                                                |
| `ConversationSnapshot`  | Portable point-in-time conversation state with no runtime-resume guarantee.                                                  |
| `ConversationMessage`   | Portable role-and-content message stored by the memory capability.                                                           |
| `ConversationRunRecord` | Terminal run history stored in a durable conversation snapshot.                                                              |
| `InteractionEvent`      | Extension union of agent, controlled-execution, and registered content events accepted by interaction projection.            |
| `InteractionProjection` | Extension state reduced deterministically from ordered interaction events.                                                   |
| `InteractionSession`    | Extension service that reserves conversation revisions, starts explicit runners, persists snapshots, and exposes raw events. |

## Boundaries

| Term              | Meaning                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Capability        | Stable contract and behavior owned by core.                                                                |
| Qualified adapter | Explicit integration subpath that maps native values to a core contract or projects core events to a host. |
| Contract          | Typed portable shape at a process, runtime, storage, or integration boundary.                              |

Qualify broad nouns such as Context, State, Memory, Runtime, Profile, Result,
and Thread so the name identifies its exact lifetime and owner.
