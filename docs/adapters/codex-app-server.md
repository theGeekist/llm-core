# Codex app-server adapter

The Codex app-server adapter qualifies the coordinator-owned app-server route against Codex CLI `0.147.0`. It is an internal candidate until a separate publication task adds a supported package export.

Applications supply the app-server process, initialisation handshake, authenticated transport policy and lifecycle through `CodexAppServerClient`. The adapter does not read an executable path, endpoint, credential or process policy from ambient host state.

Applications must also supply `CodexAppServerOutputProjector`. Native agent-message deltas remain inside the adapter and must cross that injected redaction boundary before becoming portable `AgentResult.output`. Rejection fails the run and emits `agent.run.failed`.

## Portable operations

| Portable operation      | Codex `0.147.0` route                      | Disposition              |
| ----------------------- | ------------------------------------------ | ------------------------ |
| `conversation.start`    | `thread/start`, then `turn/start`          | supported                |
| `conversation.continue` | `thread/resume`, then `turn/start`         | supported                |
| `run.observe`           | turn and item notifications                | supported                |
| `run.input.submit`      | `turn/steer` with the exact active turn ID | supported, `native-live` |
| `run.cancel`            | `turn/interrupt`                           | supported                |

The adapter exposes the returned thread ID only as an opaque `ProviderSessionRef`. A continued run must return the same thread identity. Each `turn/start` receives a distinct portable `RunId`.

`turn/steer` acknowledgement proves native acceptance only. A correlated `userMessage.clientId` notification can prove recipient observation. The app-server does not by itself prove that the model semantically processed the input, so that evidence remains explicitly unavailable unless a causation-correlated projection is added by a later exact qualification.

## Boundaries

- The adapter does not attach to Codex Desktop's private embedded app-server. Desktop visibility or shared storage is not a supported control guarantee.
- Starting or continuing a conversation never substitutes for steering an active turn. Cancellation remains a separate explicit operation.
- Raw notifications, native paths and provider payloads remain inside the adapter. Only closed portable events, text accepted by the injected redaction projector, acknowledgements and opaque references cross the boundary.
- Duplicate message identities, changed thread or turn identities, malformed responses, malformed notifications, terminal races and disconnects produce explicit rejection or failed terminal outcomes.
- The host owns approvals and other server-to-client requests. This adapter reports `controlledEffects: false` until exact approval handling qualifies and does not silently approve native effects.

The exact protocol source is the OpenAI Codex app-server protocol and generated TypeScript surface emitted by `codex app-server generate-ts --experimental` from Codex CLI `0.147.0`.
