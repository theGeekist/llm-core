// #region docs
import { fromLangChainVectorStore } from "#adapters";
import type { VectorStore } from "#adapters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

// 1. Wrap the ecosystem Store
const store: VectorStore = fromLangChainVectorStore(new MemoryVectorStore(new OpenAIEmbeddings()));

// 2. Use it in an Ingestion Workflow
interface MyDoc {
  id: string;
  text: string;
  metadata: { author: string };
}

await store.upsert({
  documents: [
    { id: "doc-1", text: "Jason likes coffee.", metadata: { author: "Jason" } },
    { id: "doc-2", text: "Jason hates tea.", metadata: { author: "Jason" } },
  ] as MyDoc[],
});
// #endregion docs
