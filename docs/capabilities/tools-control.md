# Tools and control

A `ToolSpec` declares identity, schema, effects, concurrency, cancellation, and
retry semantics. Tool arguments pass strict validation before execution.

Meaningful effects follow a controlled sequence:

1. Bind the canonical action.
2. Evaluate policy.
3. Authenticate any required approval.
4. Reserve the receipt journal and concurrency gate.
5. Execute once.
6. Persist the result and emit redacted evidence.

Retry after an effect starts requires verified idempotency or reconciliation.
Caller labels alone do not establish that guarantee.
