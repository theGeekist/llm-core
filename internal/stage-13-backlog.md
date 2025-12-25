# Stage 13 Backlog — Parity & Write-Path

Status: active. This is the source of truth for what is done vs pending.

## Done

- Vector store write-path adapter (upsert/delete) + diagnostics.
- LangChain + LlamaIndex vector store adapters.
- AI SDK media adapters: image, speech, transcription.
- AI SDK reranker adapter (RerankingModelV3).
- Adapter input validations + tests for new constructs.
- Parity audit document (`docs/interop-audit.md`).

## In Progress

- Parity-driven audit spec + tests to enforce gaps.

## Pending (Fill the Gaps)

### Streaming parity

- Normalize AI SDK V3 stream results (`LanguageModelV3`).
- Define streaming adapter surface (if we keep it).
- Map LC/LI streaming semantics (provider-specific).
- Bridge runtime streams to AI SDK transport resume without owning resumable-stream.

### Higher-level constructs (optional)

- LangChain output parsers.
- LangChain structured query / query translators.
- LlamaIndex query engines + response synthesizers.
- Tracing/callback adapters (LC + AI SDK middleware).

### AI SDK V3 surface

- `EmbeddingModelV3`, `ImageModelV3`, `SpeechModelV3`, `TranscriptionModelV3`
  wiring (if we decide to normalize beyond V2).

## Notes

This backlog is intentionally scoped to parity work. Recipes remain out of scope
until the adapter surface stabilizes.
