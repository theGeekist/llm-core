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
| `/agent`       | Agent specifications, runners, runs, and skills                    |
| `/workflow`    | Explicit workflow orchestration                                    |
| `/interaction` | Sessions, canonical projections, and reconnect state               |

Storage and retrieval ports are used through typed capability bindings and
their owning fronts. They do not expose hosted databases or framework-native
engines.
