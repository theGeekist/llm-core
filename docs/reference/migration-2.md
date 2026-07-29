# Migrate from 1.x to 2.0

Version 2 is a breaking replacement. Update imports and execution concepts
together rather than adding compatibility aliases.

| 1.x                                             | 2.0                                                             |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `AgentRuntime`, `createAgentRuntime`            | `AgentRunner`, `createLocalAgentRunner`                         |
| `AgentRuntimeInput`                             | `AgentRunRequest`                                               |
| agent execution returning workflow `Outcome`    | live `AgentRun`, then `RunResult`                               |
| `AdapterBundle`                                 | typed capability bindings and explicit ports                    |
| `createAdapterRegistry`                         | deterministic capability binding resolution                     |
| `AdapterCallContext`                            | `InvocationContext`                                             |
| adapter-owned `Model` and content               | `@geekist/llm-core/model`                                       |
| adapter-owned tools                             | `@geekist/llm-core/tools`                                       |
| adapter-owned storage/retrieval/media contracts | owning capability fronts                                        |
| `EventStream`                                   | `EventSink` for evidence or `AgentRun.events()` for consumption |
| `TraceEvent` history                            | typed execution or agent-run events                             |
| `artefact`                                      | `artifact`                                                      |
| broad adapter import                            | a qualified adapter subpath                                     |
| recipe catalogue import                         | explicit workflow or agent composition                          |

### Agent entrypoint

```ts
import { createLocalAgentRunner, prepareAgentSpec } from "@geekist/llm-core";
```

### Provider entrypoint

```ts
import { createAiSdk7Model } from "@geekist/llm-core/adapters/ai-sdk";
```

### UI entrypoints

```ts
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";
import { createAssistantUiProjectionMapper } from "@geekist/llm-core/adapters/assistant-ui";
```
