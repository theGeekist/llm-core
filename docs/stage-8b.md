# Plan

Add a minimal, DX‑friendly model execution abstraction so adapters can run models end‑to‑end (not just
shape conversion). Dogfood tool‑calling, schemaed prompts, and structured outputs across all ecosystems.
Keep MaybePromise semantics, no any, and no type explosion.

## Requirements

- Provide a single, minimal execution surface (generate now; streaming later).
- Support AI SDK, LangChain, and LlamaIndex with adapter factories.
- Surface tool calls + tool results in the result shape.
- Support schemaed prompts and structured outputs in the execution path.
- Preserve MaybePromise and avoid user‑facing generics.
- Keep runtime surface small; types inferred from adapters.
- Document the adapter execution surface in API docs.

## Scope

- In: new AdapterModel type + factories, integration tests using adapters, tool calling, schemas.
- Out: streaming, HITL flow changes.

## Files and entry points

- src/adapters/types.ts (new AdapterModel types)
- src/adapters/ai-sdk/\* (factory)
- src/adapters/langchain/\* (factory)
- src/adapters/llamaindex/\* (factory)
- src/adapters/index.ts (exports)
- tests/integration/\* (refactor to use adapters)
- docs/stage-8.md and docs/implementation-plan.md (mark progress)

## Data model / API changes

- New AdapterModel with generate(call: AdapterModelCall): AdapterMaybePromise<AdapterModelResult>.
- Extend AdapterModelResult to include toolCalls/toolResults and reasoning (optional).
- New factory exports: fromAiSdkModel, fromLangChainModel, fromLlamaIndexModel.

## Action items

[x] Define AdapterModel and result shape updates (toolCalls/toolResults/reasoning) in src/adapters/types.ts.
[x] Implement AI SDK model adapter using generateText (support tools + schemas).
[x] Implement LangChain model adapter using invoke() / call() (support tools + schemas).
[x] Implement LlamaIndex model adapter using LLM.chat() (support tools + schemas).
[x] Export factories via src/adapters/index.ts.
[x] Add tool‑calling integration tests across AI SDK, LangChain, LlamaIndex.
[x] Add structured output / schema prompt integration tests across AI SDK, LangChain, LlamaIndex.
[x] Refactor integration tests to use adapters end‑to‑end for text + embeddings + tools + schemas.
[x] Update Stage 8 docs and implementation plan.
[x] Document model execution contracts in `docs/adapters-api.md`.

## Testing and validation

- bun run typecheck
- bun run typecheck:tests
- bun test tests/integration/... with env vars

## Risks and edge cases

- LlamaIndex message content shape (string vs array) needs safe extraction.
- LangChain chat model return types vary; ensure stable text extraction.
- AI SDK errors/timeouts; keep test timeouts configurable.

## Open questions

- OK to keep streaming out of scope for now? Yes
- AdapterModelResult includes raw and metadata per provider (as per agreed shape).
- Normalize both JSON Schema and Zod; allow either when provided.
