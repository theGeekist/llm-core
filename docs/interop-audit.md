# Interop Export Audit (Stage 13)

This document is a **full export audit** across the three ecosystems we support:
AI SDK, LangChain (JS/TS), and LlamaIndex (TS). The goal is to map _every major
export surface_ to our adapter primitives, highlight mismatches, and list gaps.

This is a catalogue — not a commitment to implement every construct. Anything
outside our adapter surface is explicitly called out.

## AI SDK (ai + provider + provider-utils)

Packages audited:

- `ai` (core helpers + UI utilities)
- `@ai-sdk/provider` (model interfaces + telemetry)
- `@ai-sdk/provider-utils` (messages/tools/schemas)
- `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider-v2` (providers)

Key export categories:

- **Model interfaces**: `LanguageModelV2/V3`, `EmbeddingModelV2/V3`,
  `ImageModelV2/V3`, `SpeechModelV2/V3`, `TranscriptionModelV2/V3`,
  `RerankingModelV3`.
- **Model helpers**: `generateText`, `generateObject`, `streamText`, `streamObject`,
  `embed`, `embedMany`, `generateImage`, `generateSpeech`, `transcribe`.
- **Messages + tools** (provider-utils): `ModelMessage`, `Tool`, `Schema`, `jsonSchema`,
  `zodSchema`, content part helpers.
- **UI/runtime wrappers** (ai): chat UI, streaming UI, transport, UI message schemas.

Mapping to our primitives:

- `Model`, `Embedder`, `Reranker`, `ImageModel`, `SpeechModel`, `TranscriptionModel`
  → **covered** (V2/V3 mixed).
- `Messages`, `Tools`, `Schema`, `PromptTemplate` → **covered**.
- `Streaming` → **not normalized** (V3 introduces stream parts).
- `UI/transport` → **out of scope** (UI-only).

Gaps:

- V3 streaming model shapes are not normalized in adapters.
- V3 image/speech/transcription types not wired (V2 only).
- Provider middleware hooks exist but no adapter-level tracing bridge.

## LangChain (JS/TS)

Packages audited:

- `@langchain/core`
- `@langchain/community`
- `@langchain/openai`
- `@langchain/ollama`
- `@langchain/textsplitters`

Core module inventory (from `@langchain/core/*.d.ts`):

- `agents`, `runnables`, `tools`, `retrievers`, `vectorstores`
- `documents`, `document_loaders`, `memory`, `chat_history`, `stores`
- `prompts`, `prompt_values`, `messages`, `outputs`, `output_parsers`
- `structured_query`, `indexing`, `caches`, `callbacks`, `tracers`

Mapping to our primitives:

- `Model`, `Embedder`, `Retriever`, `Reranker`, `TextSplitter`, `Transformer`,
  `DocumentLoader`, `VectorStore`, `Memory`, `KVStore`, `Tool`, `PromptTemplate`
  → **covered**.
- `OutputParser`, `Runnable`, `StructuredQuery`, `Indexing/Record managers`,
  `Caches`, `Callbacks/Tracers`, `Agents`, `ChatHistory`
  → **not covered**.

Gaps:

- Output parsers and structured query translators are not modeled.
- Runnables/chains/agents are higher-level composition constructs.
- Caches and callbacks/tracers could be normalized but are currently out of scope.

## LlamaIndex (TS)

Packages audited (top-level modules):

- `llms`, `embeddings`, `retriever`, `postprocessor`, `node-parser`
- `tools`, `prompts`, `memory`, `schema`, `vector-store`, `storage`
- `query-engine`, `response-synthesizers`, `chat-engine`, `agent`, `indices`

Mapping to our primitives:

- `Model`, `Embedder`, `Retriever`, `Reranker`, `TextSplitter`, `Transformer`,
  `DocumentLoader`, `VectorStore`, `Memory`, `KVStore`, `Tool`, `PromptTemplate`
  → **covered**.
- `QueryEngine`, `ResponseSynthesizer`, `ChatEngine`, `Agent`, `Indices`
  → **not covered**.

Gaps:

- Query engines and response synthesizers are higher-level, not normalized.
- Storage context and index lifecycle helpers are not modeled.

## Media Construct Catalogue

### AI SDK

- Image: `ImageModelV2` (provider: `@ai-sdk/provider`)
- Speech (TTS): `SpeechModelV2`
- Transcription (STT): `TranscriptionModelV2`

Additional AI SDK interfaces worth tracking:

- `RerankingModelV3` (provider) for rerankers.
- `EmbeddingModelV3` and `LanguageModelV3` (streaming-friendly).

### LangChain (JS/TS)

- Image generation:
  - `DallEAPIWrapper` (JS) in `@langchain/openai` (`tools/dalle`)
  - `imageGeneration` tool spec (Responses API tool)
  - These are tool-style wrappers, not a generic `ImageModel` interface.
- Audio output:
  - ChatOpenAI supports audio output (model modalities + audio options)
  - This is a feature of the chat model, not a standalone `SpeechModel`.
- Transcription:
  - Document loaders for audio (e.g., `OpenAIWhisperAudio`, `SonixAudioTranscriptionLoader`)
  - These map to `DocumentLoader` rather than a formal `TranscriptionModel`.

### LlamaIndex (TS)

- Image generation:
  - Tool specs exist (e.g., OpenAI image generation tool spec)
  - Exposed via tool calling, not a dedicated `ImageModel`.
- Multimodal:
  - Multimodal LLMs handle image inputs; still a `Model` surface, not a media model.
- Audio / transcription:
  - No canonical speech/transcription model interface surfaced in core packages.

## Parity Matrix

Legend:

- **full**: adapter exists and aligns with the construct
- **partial**: adapter exists but semantics differ or are limited
- **provider-specific**: adapter only for certain providers/tools
- **missing**: no adapter or ecosystem surface

| Construct           | AI SDK  | LangChain | LlamaIndex | Mix-and-match implications                                      |
| ------------------- | ------- | --------- | ---------- | --------------------------------------------------------------- |
| Model               | full    | full      | full       | Safe to mix; Model is the canonical cross-ecosystem surface.    |
| Embedder            | full    | full      | full       | Safe; embedding dimension may still vary per provider.          |
| Retriever           | missing | full      | full       | AI SDK has no retriever abstraction; must bring one from LC/LI. |
| Reranker            | full    | full      | full       | AI SDK supports reranking via `RerankingModelV3`.               |
| TextSplitter        | missing | full      | full       | AI SDK has no splitter; LC/LI supported.                        |
| Transformer         | missing | full      | full       | AI SDK has no transformer; LC/LI supported.                     |
| Storage (KVStore)   | missing | full      | full       | AI SDK has no storage adapter.                                  |
| Cache               | missing | missing   | missing    | Core primitive only (MemoryCache).                              |
| KV                  | missing | full      | full       | AI SDK has no KV adapter.                                       |
| Memory              | missing | full      | full       | AI SDK has no memory adapter.                                   |
| Tools               | full    | full      | full       | Safe; tool schemas normalize across ecosystems.                 |
| VectorStore (write) | missing | full      | partial    | AI SDK has none; LC full; LI delete filters not supported.      |
| ImageModel          | full    | missing   | missing    | AI SDK direct; LC/LI require tool wrappers.                     |
| SpeechModel         | full    | missing   | missing    | AI SDK direct; LC via ChatOpenAI audio output.                  |
| TranscriptionModel  | full    | missing   | missing    | AI SDK direct; LC via document loaders (shape mismatch).        |
| Streaming (Model)   | partial | partial   | partial    | Varies by provider; no normalized streaming adapter yet.        |

## Summary: Coverage vs Gaps

Covered primitives (cross-ecosystem):

- `Model`, `Embedder`, `Retriever`, `Reranker`
- `TextSplitter`, `Transformer`, `DocumentLoader`
- `VectorStore` (write path), `Memory`, `KVStore`
- `Tool`, `PromptTemplate`, `Schema`, `Messages`
- `ImageModel`, `SpeechModel`, `TranscriptionModel` (AI SDK direct; LC/LI provider-specific)

Gaps (candidate future primitives):

- `StreamingModel` (normalize V3 streams + LC/LI stream semantics).
- `OutputParser` (LangChain), `StructuredQuery` (LangChain), `Indexing` (LC).
- `QueryEngine` and `ResponseSynthesizer` (LlamaIndex).
- `Callbacks/Tracers` (LangChain) → potential `TraceAdapter`.

We keep these out of the core surface to preserve DX and avoid API sprawl. If
we decide to add any, they should be optional and value-first.
