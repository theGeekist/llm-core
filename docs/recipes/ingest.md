# Tutorial: The Data Pipeline (Ingest)

Before you can "Chat with your Data" (RAG), you have to **Ingest** it.
This is usually the messy part of AI engineering. You have file formats, dirty text, token limits, and database schemas.

The **Ingest Recipe** standardizes this ETL (Extract, Transform, Load) process.

## 1. The Pipeline

The recipe enforces a clean, 4-stage pipeline.

```text
graph TD
    A --> B
```

## 2. Choosing your Adapters

Just like the Chat recipe, you verify the logic by plugging in Adapters.

- **Loader**: Use `fromLangChainLoader` to read PDFs, CSVs, or Notion.
- **Splitter**: Use a standard `RecursiveCharacterTextSplitter`.
- **Embedder**: `fromAiSdkEmbeddings` (e.g. OpenAI `text-embedding-3`).
- **VectorStore**: The destination (Pinecone, Chroma, Postgres).

## 3. The "Sync" Problem

The most important part of this recipe is the **Indexer** step.
Naive pipelines just add data. They never delete.

If you delete a file from your folder, does it disappear from your Vector DB?
**With this recipe, yes.** The Indexer tracks what it has seen and automatically cleans up "ghost" records.

## Source Code

<<< @/../src/recipes/ingest/index.ts
