# Qualified adapters

Adapters translate an external SDK at the edge of llm-core. They implement or
project a neutral contract without letting provider-native objects become
portable state.

<<< @/snippets/v2/qualified-adapters.ts

### Capability adapters

```mermaid
flowchart TB
  Application["Application composition"]
  Port["Neutral capability port"]
  Adapter["Qualified capability adapter"]
  Provider["Provider SDK"]

  Application -->|"portable request"| Port
  Port --> Adapter
  Adapter -->|"native request"| Provider
  Provider -->|"native result"| Adapter
  Adapter -->|"portable result"| Port
```

### UI projection adapters

```mermaid
flowchart TB
  Interaction["Canonical interaction projection"]
  UIAdapter["Qualified UI adapter"]
  Protocol["UI protocol"]
  Client["UI client"]

  Interaction --> UIAdapter
  UIAdapter --> Protocol
  Protocol --> Client
```

## Import a qualified boundary

There is no public broad adapters barrel. Import only the adapter you use:

| Subpath                    | Boundary                                              |
| -------------------------- | ----------------------------------------------------- |
| `/adapters/ai-sdk`         | AI SDK 7 model, media, embedding, and reranking types |
| `/adapters/ai-sdk-ui`      | AI SDK UI event projection and WebSocket transport    |
| `/adapters/assistant-ui`   | assistant-ui projection and inbound parsing           |
| `/adapters/openai-chatkit` | OpenAI ChatKit event projection                       |
| `/adapters/nlux-ui`        | NLUX projection and chat adapter                      |
| `/a2a`                     | Qualified A2A 1.0 native protocol boundary            |
| `/mcp`                     | Qualified stateless MCP 2026-07-28 boundary           |

Qualified imports keep native peer dependencies and types at the edge. Install
the corresponding optional peer only when your application uses that subpath.

The protocol subpaths are deliberately separate. `/a2a` preserves A2A-native
agent cards, messages, tasks, artefacts, streaming and delegation semantics.
`/mcp` exposes a stateless request boundary whose application binding supplies
catalogues, authorisation and handlers, while tool invocation enters the
normal llm-core controlled-execution path. Neither surface converts into the
other or owns downstream coordinator state.

Their qualification is pinned to A2A specification 1.0.0 with
`@a2a-js/sdk@1.0.0`, and MCP specification 2026-07-28 with
`@modelcontextprotocol/server@2.0.0` and
`@modelcontextprotocol/client@2.0.0`. Consumers of these native typed surfaces
install the corresponding exact SDK package alongside llm-core.

## Adapter guarantees

A useful adapter states:

- the exact native version or shape it supports;
- the neutral capability it implements;
- semantic loss at the translation boundary;
- which native metadata is omitted or redacted;
- the executable evidence behind its compatibility claim.

Adapter installation alone proves none of those claims.

Continue with [AI SDK model integration](/adapters/ai-sdk),
[UI projections](/adapters/ui), or
[runtime conformance](/adapters/runtime-conformance).
