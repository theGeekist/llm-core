# Stage 7 — Interface Discovery (Code + Docs)

Status: completed.

Purpose: inventory ecosystem interfaces and define the normalization contracts before writing adapters. This stage
prioritizes interface parity and DX clarity, not implementation.

## Scope

- In: interface discovery across LangChain, LlamaIndex, AI SDK; normalization contracts; parity test matrix.
- Out: adapter code (moved to Stage 8).

## Approach (construct-first)

Work by construct across ecosystems to avoid bias:

1. Documents
2. Messages / chat turns
3. Tool / function calling
4. Model call inputs/outputs + streaming
5. Retrieval results / citations
6. Tracing / diagnostics / errors
7. Text utilities (splitters / chunkers)
8. Embeddings
9. Retrievers
10. Rerankers / compressors
11. Loaders / transformers

## Deliverables

- `docs/stage-7.md` (this file) with consolidated findings per construct.
- `docs/implementation-plan.md` updated to move adapter code to Stage 8.
- `src/adapters/types.ts` with normalized contract types (no implementations).
- `src/adapters/index.ts` exporting contracts only.
- A normalization contract section per construct with example shapes per ecosystem.
- A parity test matrix describing how to validate equivalence.

## Peer dependency targets (for study)

- adapter-langchain
  - peers: `@langchain/core`, `@langchain/ollama` (installed)
  - optional peers: `@langchain/textsplitters` (installed), `@langchain/openai`, `@langchain/community`
- adapter-llamaindex
  - peers: `llamaindex`, `openai`, `ollama`
- adapter-ai-sdk
  - peers: `ai`
  - optional peers: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider-v2` (no `@ai-sdk/ollama`)

## Action items

[x] Capture Document shapes across the three ecosystems and define a normalized Document contract.
[x] Capture Message/Chat shapes and define a normalized Message contract.
[x] Capture Tool/function shapes and define a normalized Tool contract.
[x] Capture Model call + streaming shapes and define a normalized ModelCall contract.
[x] Capture Retrieval + citation shapes and define a normalized RetrievalResult contract.
[x] Capture Trace/Diagnostics/Error shapes and define normalized Trace/Diagnostic contracts.
[x] Capture TextSplitter/Chunker shapes and define normalized Text utility contracts.
[x] Capture Embedding shapes and define normalized Embedder contracts.
[x] Capture Retriever shapes and define normalized Retriever contracts.
[x] Capture Reranker/Compressor shapes and define normalized Reranker contracts.
[x] Capture Loader/Transformer shapes and define normalized Loader/Transformer contracts.
[x] Define parity test matrix for each construct (inputs/outputs, streaming, tool calls, RAG).

## Testing and validation

- Stage 7 adds parity/shape tests to validate that types and mappings line up.
- Stage 8 will add integration tests gated by environment (e.g., Ollama daemon, API keys).

## Risks

- Interface drift across ecosystems can lead to overfitting; normalize only shared semantics.
- Too much abstraction can hide useful details; keep escape hatches explicit.

## Construct findings (normalized contracts)

References are the authoritative installed package types in this repo.

### Document

Normalized: `AdapterDocument` in `src/adapters/types.ts` with `text`, `metadata`, `id`, `score`.

- LangChain: `Document` has `pageContent`, `metadata`, `id`. `node_modules/@langchain/core/dist/documents/document.d.ts`
- LlamaIndex: `Document` extends `TextNode` with `id_`, `text`, `metadata`, embeddings, relationships. `node_modules/@llamaindex/core/schema/dist/index.d.ts`
- AI SDK: no document abstraction in core.

### Messages / chat

Normalized: `AdapterMessage` with `content` as `string | AdapterMessagePart[]`.

- LangChain: `BaseMessage` content is string or content blocks; tool calls are content blocks. `node_modules/@langchain/core/dist/messages/base.d.ts` and `node_modules/@langchain/core/dist/messages/content/index.d.ts`
- LlamaIndex: `ChatMessage` uses `role` and `MessageContent` (string or multimodal detail list). `node_modules/@llamaindex/core/llms/dist/index.d.ts`
- AI SDK: `ModelMessage` variants with `UserContent` / `AssistantContent` parts including tool calls/results. `node_modules/@ai-sdk/provider-utils/dist/index.d.ts`

Normalized parts: text, image, file, reasoning, tool-call, tool-result, data.

### Tools / function calling

Normalized: `AdapterTool`, `AdapterToolCall`, `AdapterToolResult`.

- LangChain: `StructuredTool` / `DynamicStructuredTool` accept Zod or JSON schema and optional execution. `node_modules/@langchain/core/dist/tools/index.d.ts`
- LlamaIndex: `BaseTool` includes metadata (name, description, parameters) and optional `call`. `node_modules/@llamaindex/core/llms/dist/index.d.ts`
- AI SDK: `Tool` has `inputSchema`, optional `outputSchema`, and `execute` hooks. `node_modules/@ai-sdk/provider-utils/dist/index.d.ts`

### Model calls + streaming

Normalized: `AdapterModelCall`, `AdapterModelResult`, `AdapterStreamChunk`.

- LlamaIndex: `LLM.chat` accepts `messages`, `tools`, `responseFormat` and returns `ChatResponse` or async chunks. `node_modules/@llamaindex/core/llms/dist/index.d.ts`
- AI SDK: `Prompt` supports `system` + `prompt` or `messages`, and streaming via model calls. `node_modules/ai/dist/index.d.ts`
- LangChain: message-driven calls and tool calls are part of message content; response metadata and tool calls are recorded in message structures. `node_modules/@langchain/core/dist/messages/base.d.ts`

Normalized call allows `messages` or `prompt` + `system`, with tool choice and sampling settings.

### Retrieval + citations

Normalized: `AdapterRetrievalResult` with `documents` and `citations`.

- LangChain: retrievers return `Document` lists. `node_modules/@langchain/core/dist/documents/document.d.ts`
- LlamaIndex: results include `NodeWithScore` and `sourceNodes`. `node_modules/@llamaindex/core/schema/dist/index.d.ts`
- AI SDK: no retrieval core abstraction.

### Prompts + prompt schemas

Normalized: `AdapterPromptTemplate`, `AdapterPromptSchema`, `AdapterSchema`, `AdapterStructuredResult`.

- LangChain: `PromptTemplate`, `ChatPromptTemplate`, `StructuredPrompt` with `schema` and `method`. `node_modules/@langchain/core/dist/prompts/structured.d.ts`
- LlamaIndex: `PromptTemplate` with `templateVars`, `promptType`, and output parser. `node_modules/@llamaindex/core/prompts/dist/index.d.ts`
- AI SDK: `Prompt` is system + prompt/messages. `node_modules/ai/dist/index.d.ts`

### Memory

Normalized: `AdapterMemory`, `AdapterThread`, `AdapterTurn`.

- LangChain: `BaseMemory` with `loadMemoryVariables` + `saveContext`. `node_modules/@langchain/core/dist/memory.d.ts`
- LlamaIndex: `Memory` with `getLLM`, `add`, `clear`, snapshot + adapters. `node_modules/@llamaindex/core/memory/dist/index.d.ts` (BaseMemory is deprecated)
- AI SDK: no core memory interface.

### Storage

Normalized: `AdapterKVStore`, `AdapterStorage`.

- LangChain: `BaseStore` with `mget/mset/mdelete/yieldKeys`. `node_modules/@langchain/core/dist/stores.d.ts`
- LlamaIndex: `BaseKVStore` and `BaseDocumentStore`. `node_modules/@llamaindex/core/storage/doc-store/dist/index.d.ts`
- AI SDK: no core storage interface.

### Trace + diagnostics

Normalized: `AdapterTraceEvent`, `AdapterDiagnostic`.

- LangChain: callbacks/tracers (not captured in a single type; adapters should map to events).
- LlamaIndex: logger + response metadata; adapters can emit trace events per call.
- AI SDK: telemetry settings + provider metadata; adapters should map to trace/diagnostic entries.

### Text utilities (splitters / chunkers)

Normalized: `AdapterTextSplitter` (split, batch split, and optional metadata-aware split).

- LangChain: `TextSplitter`, `RecursiveCharacterTextSplitter` in `@langchain/textsplitters`. `node_modules/@langchain/textsplitters/dist/text_splitter.d.ts`
- LlamaIndex: `TextSplitter`, `SentenceSplitter`, `TokenTextSplitter` in `@llamaindex/core/node-parser`. `node_modules/@llamaindex/core/node-parser/dist/index.d.ts`
- LlamaIndex: code splitter in `@llamaindex/node-parser/code`. `node_modules/@llamaindex/node-parser/code/dist/index.d.ts`
- AI SDK: no core splitter abstraction.

### Embeddings

Normalized: `AdapterEmbedder`.

- LangChain: `Embeddings` with `embedQuery` and `embedDocuments`. `node_modules/@langchain/core/dist/embeddings.d.ts`
- LlamaIndex: `BaseEmbedding` with `getTextEmbedding` and `getTextEmbeddings`. `node_modules/@llamaindex/core/embeddings/dist/index.d.ts`
- AI SDK: `EmbeddingModel` + `embed`/`embedMany` utilities. `node_modules/ai/dist/index.d.ts`

### Retrievers

Normalized: `AdapterRetriever` returning `AdapterRetrievalResult`.

- LangChain: `BaseRetriever` with `invoke(query)` returning documents. `node_modules/@langchain/core/dist/retrievers/index.d.ts`
- LlamaIndex: `BaseRetriever` with `retrieve(query)` returning `NodeWithScore`. `node_modules/@llamaindex/core/retriever/dist/index.d.ts`
- AI SDK: no retriever abstraction.

### Rerankers / compressors

Normalized: `AdapterReranker` reranking `AdapterDocument[]`.

- LangChain: `BaseDocumentCompressor` with `compressDocuments(documents, query)`. `node_modules/@langchain/core/dist/retrievers/document_compressors/index.d.ts`
- LlamaIndex: `BaseNodePostprocessor` with `postprocessNodes(nodes, query)`. `node_modules/@llamaindex/core/postprocessor/dist/index.d.ts`
- AI SDK: no reranker abstraction.

### Loaders / transformers

Normalized: `AdapterDocumentLoader`, `AdapterDocumentTransformer`.

- LangChain: `BaseDocumentLoader` with `load()`. `node_modules/@langchain/core/dist/document_loaders/base.d.ts`
- LangChain: `BaseDocumentTransformer` with `transformDocuments(documents)`. `node_modules/@langchain/core/dist/documents/transformers.d.ts`
- LlamaIndex: `BaseReader` with `loadData(...)`. `node_modules/@llamaindex/core/schema/dist/index.d.ts`
- LlamaIndex: `NodeParser` with `getNodesFromDocuments`. `node_modules/@llamaindex/core/node-parser/dist/index.d.ts`
- AI SDK: no loader/transformer abstraction.

## Parity matrix (scaffold)

Stage 7 adds shape tests under `tests/interop/` to document expected mappings. Stage 8 will implement
real adapters to satisfy these shapes.

- Documents
  - LangChain Document -> AdapterDocument
  - LlamaIndex Document -> AdapterDocument
- Messages
  - LangChain BaseMessage -> AdapterMessage
  - LlamaIndex ChatMessage -> AdapterMessage
  - AI SDK ModelMessage -> AdapterMessage
- Tools
  - LangChain Tool -> AdapterTool
  - LlamaIndex BaseTool -> AdapterTool
  - AI SDK Tool -> AdapterTool
- Model calls
  - LlamaIndex ChatMessage[] -> AdapterModelCall
  - AI SDK Prompt -> AdapterModelCall
- Memory
  - LangChain BaseMemory -> AdapterMemory
  - LlamaIndex Memory -> AdapterMemory
- Storage
  - LangChain BaseStore -> AdapterKVStore
  - LlamaIndex BaseDocumentStore -> AdapterKVStore
- Prompts
  - LangChain PromptTemplate -> AdapterPromptTemplate
  - LlamaIndex PromptTemplate -> AdapterPromptTemplate
- Text utilities
  - LlamaIndex TextSplitter -> AdapterTextSplitter
  - LangChain splitter -> AdapterTextSplitter
- Embeddings
  - LangChain Embeddings -> AdapterEmbedder
  - LlamaIndex BaseEmbedding -> AdapterEmbedder
  - AI SDK embed/embedMany -> AdapterEmbedder
- Retrievers
  - LangChain BaseRetriever -> AdapterRetriever
  - LlamaIndex BaseRetriever -> AdapterRetriever
  - AI SDK: none
- Rerankers / compressors
  - LangChain BaseDocumentCompressor -> AdapterReranker
  - LlamaIndex BaseNodePostprocessor -> AdapterReranker
  - AI SDK: none
- Loaders / transformers
  - LangChain BaseDocumentLoader -> AdapterDocumentLoader
  - LangChain BaseDocumentTransformer -> AdapterDocumentTransformer
  - LlamaIndex BaseReader -> AdapterDocumentLoader
  - LlamaIndex NodeParser -> AdapterDocumentTransformer
  - AI SDK: none
