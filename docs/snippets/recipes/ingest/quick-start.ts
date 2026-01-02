// #region docs
import { recipes } from "#recipes";
import { fromLangChainTextSplitter, fromAiSdkEmbeddings } from "#adapters";
import type { DocumentLoader, VectorStore, VectorStoreUpsertInput } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const loader: DocumentLoader = {
  load: async () => [{ id: "intro", text: "Hello world." }],
};

const textSplitter = fromLangChainTextSplitter(
  new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 200 }),
);
const embedder = fromAiSdkEmbeddings(openai.embedding("text-embedding-3-small"));

const readUpsertIds = (input: VectorStoreUpsertInput) =>
  "documents" in input
    ? input.documents.map((item) => item.id ?? "new")
    : input.vectors.map((item) => item.id ?? "new");

const vectorStore: VectorStore = {
  upsert: (input) => ({ ids: readUpsertIds(input) }),
  delete: () => true,
};

const ingest = recipes.ingest().defaults({
  adapters: { loader, textSplitter, embedder, vectorStore },
});

const outcome = await ingest.run({
  sourceId: "docs:book",
  documents: [{ id: "intro", text: "Hello world." }],
});

if (outcome.status === "ok") {
  console.log(outcome.artefact["ingest.upserted"]);
}
// #endregion docs
