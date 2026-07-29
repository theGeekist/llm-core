# Capabilities

Capabilities are typed ports with portable requests, results, and evidence.
Composition supplies live implementations; application orchestration depends
only on public contracts.

| Subpath        | Responsibility                                                     |
| -------------- | ------------------------------------------------------------------ |
| `/model`       | Content, requests, responses, profiles, schemas, and media         |
| `/tools`       | Tool specifications, strict validation, and action digests         |
| `/control`     | Policy, approval, cancellation, and concurrency                    |
| `/evidence`    | Redacted events, usage, and receipts                               |
| `/state`       | Live, snapshot, resumable, provider-session, and durable lifetimes |
| `/agent`       | Agent lifecycle, composition, bindings, knowledge, and memory      |
| `/workflow`    | Explicit workflow orchestration                                    |
| `/interaction` | Sessions, canonical projections, and reconnect state               |

Storage, memory, retrieval, and indexing ports are imported from `/agent` and
selected through typed capability bindings. They do not expose hosted
databases or framework-native engines.
