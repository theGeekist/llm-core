# Tools and control

A `ToolSpec` declares identity, schema, effects, concurrency, cancellation, and
retry semantics. Tool arguments pass strict validation before execution.

Meaningful effects follow a controlled sequence:

1. Bind the canonical action and compute its digest.
2. Atomically reserve the authoritative receipt by idempotency key.
3. Durably append `awaiting_policy`.
4. Evaluate policy against the exact action digest.
5. Request and authenticate approval when policy requires it.
6. Acquire the separate concurrency lease.
7. Durably append `started`.
8. Invoke the executable binding once.
9. Persist the resulting disposition and project redacted events; release the
   lease during cleanup.

Retry after an effect starts requires verified idempotency or reconciliation.
Caller labels alone do not establish that guarantee.

The receipt reservation and concurrency lease are different coordination
mechanisms. The receipt journal establishes durable identity and recovery;
the gate limits overlapping live execution. Neither substitutes for the
other, and an `EventSink` substitutes for neither.
