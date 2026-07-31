# Controlled tool execution

Meaningful tool effects fail closed. `executeControlledTool` does not call a
tool until the action is bound, the durable receipt is reserved, required
policy and approval checks succeed, and a concurrency lease is acquired.

<<< @/snippets/v2/controlled-tool-execution.ts

## One authority chain

```mermaid
sequenceDiagram
  participant Host
  participant Control as executeControlledTool
  participant Journal as ToolReceiptJournal
  participant Policy as PolicyEvaluationPort
  participant Approval as ToolApprovalPort
  participant Gate as ConcurrencyGate
  participant Tool as ExecutableTool
  participant Events as EventSink

  Host->>Control: tool, call, security domain, ports
  Control->>Control: bind action and compute digest
  Control->>Journal: reserve idempotency identity
  Journal-->>Control: authoritative receipt
  Control-->>Events: schedule reservation event
  Control->>Journal: append awaiting_policy
  Control-->>Events: schedule transition event
  Control->>Policy: evaluate exact action digest
  opt approval required
    Control->>Approval: request and authenticate decision
    Control->>Journal: append awaiting_approval or ready
    Control-->>Events: schedule transition event
  end
  Control->>Gate: acquire lease
  Control->>Journal: append started
  Control-->>Events: schedule started event
  Control->>Tool: execute once
  Tool-->>Control: ToolExecutionResult
  Control->>Journal: append terminal disposition
  Control-->>Events: schedule terminal event
  Control-->>Host: ControlledToolExecutionOutcome
```

The journal and gate solve different problems. The
`ToolReceiptJournal` establishes durable identity and recovery state. The
`ConcurrencyGate` limits overlapping live work. An `EventSink` projects
evidence, but it is neither persistence nor execution authority.

## Outcomes

`ControlledToolExecutionOutcome` makes coordination visible:

| Status                                     | Meaning                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `succeeded`, `failed`                      | The executable tool returned a terminal `ToolExecutionResult`.          |
| `awaiting-approval`, `cancelled`, `denied` | Control stopped before execution or followed an authoritative decision. |
| `existing`                                 | The reservation resolved to an existing terminal receipt.               |
| `indeterminate`                            | Execution may have started, but completion is not authoritative.        |
| `conflict`                                 | The idempotency identity is already bound to a different receipt.       |

Completed receipt outcomes also report event delivery as `scheduled`, `failed`,
or `not-configured`. Delivery failure does not erase a durable receipt.

## Redaction and native data

Supply explicit `RedactionMetadata` for sensitive categories. Canonical
`ToolExecutionEvent` values contain action digests, receipt state, safe control
facts, and optionally already-redacted extensions. They do not carry raw tool
arguments or results.

## Durable intervention resume

Runtime `resumeInterventionWorkflow` is the workflow-level path for an
authenticated decision against a registered checkpoint. Its journal atomically
consumes the decision, claims the checkpoint when execution will continue,
records meaningful effects, and commits or quarantines the
`ControlledWorkflowResult`.

If an effect is `started` or its state is indeterminate, the outcome is
`reconciliation-required`. Automatic replay is not authorized.
