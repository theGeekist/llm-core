# Failures and diagnostics

llm-core uses typed outcomes for expected operational states and throws for invalid contracts, forged runtime facades, and coordination responses that cannot be trusted. This page collects the public failure families; capability pages remain authoritative for recovery behavior.

## Boundary and model failures

| Surface | Failure form | Meaning |
| --- | --- | --- |
| Tool argument validation | `ToolArgumentValidationError` | Arguments do not satisfy the registered strict schema. |
| Model response | `{ kind: "error", error: ModelError }` | A provider call completed with `provider-error`, `rate-limited`, `timeout`, `cancelled`, `invalid-request`, `content-filter`, or `unknown`. |
| Contract boundary | `TypeError` | Portable data, identity, version, schema, or runtime provenance is invalid. |

Model errors carry a portable code and message. Provider-native codes and metadata remain optional edge data. See [Model and media](/capabilities/model).

## Model resolution diagnostics

`ModelResolutionOutcome` is either `resolved` with one exact `ModelResolution`, or `unresolved` with a reason and `ResolutionDiagnostic` values:

| Unresolved reason     | Meaning                                                  |
| --------------------- | -------------------------------------------------------- |
| `no-eligible-binding` | No registered binding satisfies capabilities and policy. |
| `ambiguous`           | More than one eligible binding remains.                  |
| `unknown-selection`   | An explicit model selection matches no known binding.    |

Diagnostics retain the selection, exclusion, version, constraint, policy, and evaluator decisions that produced the outcome. They are separate from provider execution errors because resolution occurs before a model call.

## Capability binding diagnostics

`CapabilityBindingResolutionOutcome` is either `resolved` or `unresolved`. Both variants carry `CapabilityBindingDiagnostic` values so selection, duplicates, unsupported ranges, missing bindings, and invalid bindings remain inspectable without parsing an exception message. An unresolved required capability must be handled before execution.

## Controlled effects

`ControlledToolExecutionOutcome` keeps recovery-significant states distinct:

| Status | Caller action |
| --- | --- |
| `succeeded`, `failed` | Consume the result and authoritative receipt. |
| `awaiting-approval` | Retain the reservation and resume with authenticated approval. |
| `denied`, `cancelled` | Treat the effect as not authorized or cancelled under the recorded disposition. |
| `existing` | Use the authoritative terminal receipt; do not replay the effect. |
| `conflict` | Reconcile the competing idempotency reservation. |
| `indeterminate` | Reconcile externally before any retry. |

Malformed journal acknowledgements and other untrustworthy coordination responses throw `ToolExecutionCoordinationError`. See [Controlled tool execution](/orchestration/controlled-tool-execution).

## Resume and agent outcomes

`ResumeCompatibility` reports whether a registered checkpoint can run under the expected runtime and contract facts. The runtime integration owns the result of a native resume attempt. When a meaningful effect is recorded as `started` or `indeterminate`, the integration must reconcile it before retry.

An `AgentResult` terminates as `completed`, `failed`, `denied`, or `cancelled`. Its optional `reasonCode` is a safe machine-readable category, not provider-native error payload. See [State and durability](/capabilities/state) and [Agents and runtime integrations](/guide/agent).
