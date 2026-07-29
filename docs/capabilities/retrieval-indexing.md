# Retrieval and indexing

Retrieval reads knowledge; indexing changes an index. Their ports share
portable documents but have different lifecycle and effect expectations.

<<< @/snippets/v2/retrieval-indexing.ts

An ingestion composition typically loads, transforms and splits documents,
embeds them, then invokes an `Indexer` or `VectorStore`. A query composition
builds a `RetrievalQuery`, invokes a `Retriever`, optionally reranks, and may
send the selected documents to a `ResponseSynthesizer`.

Index mutations are meaningful effects. Route orchestration that can change an
external index through the controlled effect boundary and give it an
idempotency/reconciliation strategy. Retrieval results may carry only
portable, redacted `extensions`; provider-native documents stay inside the
adapter.

`Retriever`, `Indexer`, `VectorStore`, document transforms, rerankers, and
response synthesizers are imported from `/agent`. The package defines their
contracts; your capability binding selects a qualified live implementation.
