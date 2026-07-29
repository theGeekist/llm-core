# Evidence

Evidence records what controlled execution established without coupling the
contract to a database or telemetry vendor. `/evidence` exports redacted
`ExecutionEvent` values, an `EventSink`, and the `ToolReceiptJournal` port.

<<< @/snippets/v2/evidence-redaction.ts

`ExecutionEvent` describes the controlled tool-execution lifecycle. It is not
an `AgentRunEvent`, an `InteractionEvent`, or a general tracing event. Keeping
these families separate prevents one lifecycle from being interpreted as
another.

## Receipts are authoritative

A `ToolExecutionReceipt` binds an idempotency key, action digest, policy
decision, approval, transitions, and final effect disposition. The journal is
a storage-neutral port with explicit reserve, append, load, and lookup
operations. Your adapter supplies atomic persistence.

Events are projections of the durable execution record. They are useful for
observation, but replaying an event sink does not substitute for receipt
recovery.

## Redaction happens before emission

`redactedNativeExtensions` accepts strict JSON only after sensitive provider
values have been removed or replaced. Namespaced extensions preserve safe
native detail without exposing credentials, raw headers, signed URLs, or
provider objects.

An `EvidenceRef` identifies evidence held behind authorized storage. It carries
integrity metadata, not a locator or permission to disclose the content.
