# Stage 13 Backlog — Parity & Write-Path

Status: complete. This is the source of truth for what was done in Stage 13.

## Done

- Vector store write-path adapter (upsert/delete) + diagnostics.
- LangChain + LlamaIndex vector store adapters.
- AI SDK media adapters: image, speech, transcription (V3).
- AI SDK reranker adapter (RerankingModelV3).
- AI SDK memory adapter via `@ai-sdk-tools/memory`.
- Cache adapters: AI SDK CacheStore, LangChain BaseStore, LlamaIndex BaseKVStore (TTL best-effort).
- Adapter input validations + tests for new constructs.
- Streaming normalization across AI SDK, LangChain, LlamaIndex.
- LangChain output parsers + structured query adapters.
- LlamaIndex query engine + response synthesizer adapters.
- LangChain trace adapter (callbacks/tracers as sinks).
- AI SDK V3 canonical surface (model/image/speech/transcription/embeddings + tools schema).
- Parity audit document (`docs/interop-audit.md`).

## Moved to Stage 15 (carryover)

- Transport-level resume bridge (AI SDK UI streaming + resumable streams).
- Orchestration adapters (checkpoint/interrupt/eventStream/trace extensions).
- Rollback/pause semantics alignment.

## Notes

This backlog is intentionally scoped to parity work. Recipes remain out of scope
until the adapter surface stabilizes.
