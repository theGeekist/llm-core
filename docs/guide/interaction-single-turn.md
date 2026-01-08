---
title: Single-Turn Interaction
---

# Single-Turn Interaction (UI-Ready State)

This guide builds a **single-turn** interaction loop. The goal is to turn model/query streams into
deterministic, UI-ready state without pulling in the workflow runtime.

This is the lightest orchestration layer in the stack.

> [!NOTE] > **Demo path (1/4)** - Start here to learn the interaction stack:
> Single-Turn -> Sessions + Transport -> End-to-End UI -> Workflow Orchestration.

---

## 1) Working demo

<<< @/snippets/guide/interaction-single-turn.js#docs

What you get:

- `InteractionState.messages` with user/assistant/tool messages.
- `InteractionState.events` if you opt into event capture.
- Trace + diagnostics always present.

Tip: you can pass an existing `state` to append to previous messages, even in a single-turn
interaction. This becomes the foundation for multi-turn sessions.

---

## Result shapes (ok vs paused)

Interaction runs can return either:

- **Run result** with `artefact` (normal completion).
- **Paused snapshot** with `__paused: true` and a `snapshot` (when a step pauses).

In code, check for the paused marker and branch accordingly.

---

## 2) Options and interoperability

### Swap model providers (no code rewrite)

```diff
- import { openai } from "@ai-sdk/openai";
+ import { anthropic } from "@ai-sdk/anthropic";

- const model = fromAiSdkModel(openai("gpt-4o-mini"));
+ const model = fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"));
```

### Use LangChain or LlamaIndex models

```js
import { fromLangChainModel } from "@geekist/llm-core/adapters";
import { ChatOpenAI } from "@langchain/openai";

const model = fromLangChainModel(new ChatOpenAI({ modelName: "gpt-4o-mini" }));
```

### Stream to UI SDKs

You can map `InteractionEvent` to UI-specific streams or commands via adapters:

- AI SDK UI chunks (`@geekist/llm-core/adapters/ai-sdk-ui`)
- assistant-ui commands (`@geekist/llm-core/adapters/assistant-ui`)
- ChatKit DOM events (`@geekist/llm-core/adapters/openai-chatkit`)

---

## 3) Why this is better than ad-hoc streaming

- **Deterministic state**: same inputs → same projected UI state.
- **No async coloring**: the pipeline stays `MaybePromise`-native.
- **Provider agnostic**: adapters normalize streams before they hit your UI.

---

## Next step

If you need persistence and multi-turn sessions, continue to:

- [Sessions + Transport](/guide/interaction-sessions)
