# Evidence and state

Evidence is storage-neutral. Events and receipts contain portable, redacted
facts; storage is supplied through explicit ports.

State lifetimes remain distinct:

| Lifetime                 | Meaning                                         |
| ------------------------ | ----------------------------------------------- |
| `LiveContinuation`       | Process-local continuation of live values       |
| `Snapshot`               | Portable point-in-time state observation        |
| `ResumableCheckpoint`    | Durable workflow state that passed registration |
| `ProviderSessionRef`     | Opaque provider continuity                      |
| `DurableExecutionHandle` | External durable execution identity             |

A live continuation can support reconnect or another in-process continuation,
but has no portable schema and cannot enter a durable resume API. A snapshot
is serializable but makes no resumability or exactly-once guarantee.

Only a registered `ResumableCheckpoint` enters local checkpoint resume. Resume
validates runtime, contract schema, code, checkpoint format, native references
and recorded effect disposition before execution continues. A
`ProviderSessionRef` continues provider conversation state; a
`DurableExecutionHandle` signals work owned by an external durable runtime.
Neither is interchangeable with a checkpoint.
