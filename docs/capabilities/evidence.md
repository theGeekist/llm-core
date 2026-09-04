# Evidence

Evidence records what controlled execution established without coupling the contract to a database or telemetry vendor. `/evidence` exports redacted `ToolExecutionEvent` values, an `EventSink`, and the `ToolReceiptJournal` port.

<<< @/snippets/v2/evidence-redaction.ts

`ToolExecutionEvent` describes the controlled tool-execution lifecycle. It is not an `AgentEvent`, an `InteractionEvent`, or a general tracing event. Keeping these families separate prevents one lifecycle from being interpreted as another.

## Receipts are authoritative

A `ToolExecutionReceipt` binds an idempotency key, action digest, policy decision, approval, transitions, and final effect disposition. The journal is a storage-neutral port with explicit reserve, append, load, and lookup operations. Your adapter supplies atomic persistence.

Events are projections of the durable execution record. They are useful for observation, but replaying an event sink does not substitute for receipt recovery.

## Receipt recovery lifecycle

```mermaid
stateDiagram-v2
  [*] --> reserved
  reserved --> awaiting_policy
  reserved --> denied
  reserved --> expired
  reserved --> cancelled_before_start
  awaiting_policy --> awaiting_approval
  awaiting_policy --> ready
  awaiting_policy --> denied
  awaiting_policy --> expired
  awaiting_policy --> cancelled_before_start
  awaiting_approval --> awaiting_approval
  awaiting_approval --> ready
  awaiting_approval --> denied
  awaiting_approval --> expired
  awaiting_approval --> cancelled_before_start
  ready --> started
  ready --> denied
  ready --> expired
  ready --> cancelled_before_start
  started --> started
  started --> succeeded
  started --> failed_after_start
  started --> indeterminate
  indeterminate --> succeeded
  indeterminate --> failed_after_start
  indeterminate --> reconciliation_required
  succeeded --> compensation_required
  failed_after_start --> compensation_required
  compensation_required --> compensating
  compensating --> compensated
  compensating --> compensation_failed
```

Denied, expired, and cancelled-before-start are terminal branches before `started`. An indeterminate receipt may be reconciled to succeeded or failed-after-start when authoritative evidence becomes available.

Receipt state and effect disposition answer different questions:

| Effect disposition | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `not-started`      | Execution did not cross the durable started boundary |
| `none`             | The operation completed without a meaningful effect  |
| `applied`          | The intended effect is known to have applied         |
| `partial`          | Only part of the intended effect applied             |
| `unknown`          | The effect cannot yet be established                 |
| `compensated`      | A recorded compensation completed                    |

The receipt snapshot is append-derived. Recovery loads its ordered durable history; it does not infer state from best-effort events.

## Redaction happens before emission

`redactedNativeExtensions` accepts strict JSON only after sensitive provider values have been removed or replaced. Namespaced extensions preserve safe native detail without exposing credentials, raw headers, signed URLs, or provider objects.

An `EvidenceRef` identifies evidence held behind authorized storage. It carries integrity metadata, not a locator or permission to disclose the content.

## Model usage is an observed receipt

`createUsageReceipt` snapshots observed provider or adapter token usage against the exact invocation and resolved model/profile identity. It can record a provider request ID when one is available, but it accepts neither a native response object nor provider credentials. The receipt makes attribution explicit: it is attributed, partially attributed with named missing metrics, or unavailable with a bounded reason. `attributed` requires every portable usage metric; `partial.missing` must name exactly the metrics the receipt does not contain, so a provider response cannot overstate its coverage.

For a completed portable `ModelResponse`, `createObservedModelUsageReceipt` derives that identity from `model.profile`, records the response's observed usage and request ID, and drops its content, warnings, errors, and native metadata. A response without usage becomes an explicit `not-reported` attribution rather than an inferred zero.

The receipt always carries an explicit pricing disposition. When pricing cannot be verified, it records an `unavailable` pricing disposition (`not-provided`, `stale`, or `unverified-source`), so it cannot accidentally create a cost claim. Cost estimation and reconciliation build on usage receipts through distinct, portable records.

Downstream products may correlate receipts with project or work records through stable identities. Correlation does not assign those semantics to the receipt. In particular, a provider receipt does not establish that repository work was accepted, that an intervention caused an outcome, or that a comparison window is admissible. Those conclusions remain with the consuming product and must be withheld when its evidence is insufficient.

This boundary is also what permits an independent-executor proof. A native or external executor records what it attempted and what it observed. It cannot mark its own work accepted, redefine the authorised Project intent or turn a provider success state into an improved delivery, product or business outcome. The consuming composition must join separately owned evidence and may return an inconclusive result.

`createBudgetDecisionEvidence` records a composition-owned allow, warn, stop, or overrun decision for a known invocation and budget limit. It is evidence of the decision, not a budget controller and not a rewrite of observed usage.

## Cost facts are portable estimates and provider reconciliations

Cost facts represent valuation and reconciliation separately from observed usage receipts. `CostEstimate` snapshots a price-source-backed valuation against a `UsageReceipt` without reinterpreting token counts or minting financial authority. `createCostEstimate` enforces two key boundaries:

- A valid estimate embeds the validated usage receipt and carries the exact usage units valued. Every unit must match the corresponding observation in that receipt. The estimate also carries an external price source ID, a contract version, an effective timestamp, a currency, a decimal amount string, and optional assumptions.
- An unavailable estimate (`no-pricing`, `stale-pricing`, `incomplete-usage`, `unverified-source`) carries **no money, no currency, and no price source**. It records the structural absence of pricing rather than an inferred zero or placeholder value.

Estimates remain descriptive evidence; they cannot deserialize as financial charges, billing executions, or invoices.

`ReconciledCost` joins a portable `CostEstimate` with an authoritative `ProviderCostRecord`. `deriveReconciliationDisposition` and `createReconciledCost` derive reconciliation purely:

- Presence of an authoritative provider record is strictly biconditional with `reconciled`, `divergent` (`amount-mismatch` or `currency-mismatch`), and `unreconcilable` (`estimate-unavailable`) dispositions. A reconciled cost with no provider record requires an `unavailable` disposition (`no-provider-record` or `pending`).
- Exact decimal equality is derived on string representations without floating-point inaccuracy, matching values such as `"1.50"` and `"1.5"`.
- A provider record identifies its provider and source, versions that source, and cites an evidence reference. A contradictory provider or `providerRequestId` between the embedded receipt and provider record is rejected outright as an identity error.

Factories snapshot external inputs through the strict JSON boundary before validating closed record shapes. Array subclasses, accessors, sparse arrays, prototype pollution, and nested authority fields therefore cannot enter the portable facts.

Host compositions provide pricing and provider data through explicit ports. `PriceFactPort` and `ProviderCostReconciliationPort` return `MaybePromise`, enabling synchronous in-memory lookup or asynchronous external query without forcing synthetic Promise allocations onto synchronous flows.

## Cache reuse records avoided usage, not billing credit

`createCacheAttributionRecord` embeds the validated usage receipt and records cache hit, miss, or not-applicable dispositions alongside observed or declared baseline token quantities. It captures avoided usage against a prior observation or declared baseline, but it carries **zero money, rate, currency, or charge semantics**. Valuing cache savings in monetary terms remains an external estimation concern owned by consuming host compositions.

## Observability is a one-way projection

The internal OpenTelemetry projection adapter accepts a canonical `ToolExecutionEvent`, projects a fixed safe subset of its facts, and schedules one best-effort span or log export. It declares its sampling, redaction, delivery, and retention behavior. Native extensions, authorized evidence references, action digests, provider request metadata, and credentials are never projected.

An exporter failure is ignored after scheduling and is never retried by the adapter. It cannot acknowledge, gate, or replay a model or tool effect. Trace context only correlates the projection with an external trace; the canonical event and receipt remain the source of truth.
