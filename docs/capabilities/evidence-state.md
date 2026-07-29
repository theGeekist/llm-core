# Evidence and state

Evidence is storage-neutral. Events and receipts contain portable, redacted
facts; storage is supplied through explicit ports.

State lifetimes remain distinct:

| Lifetime                 | Meaning                                         |
| ------------------------ | ----------------------------------------------- |
| `LiveContinuation`       | Process-local reconnect handle                  |
| `Snapshot`               | Portable application state                      |
| `ResumableCheckpoint`    | Durable workflow state that passed registration |
| `ProviderSessionRef`     | Opaque provider continuity                      |
| `DurableExecutionHandle` | External durable execution identity             |

A live continuation never claims durable recovery. Resume validates
compatibility and recorded effect disposition before execution continues.
