// #region docs
import { recipes } from "#recipes";
import { fromLangChainTextSplitter, fromAiSdkEmbeddings } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// #endregion docs

// #region docs
/** @type {import("@geekist/llm-core/adapters").DocumentLoader} */
const loader = {
  load: async () => [{ id: "intro", text: "Hello world." }],
};
const textSplitter = fromLangChainTextSplitter(
  new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 200 }),
);
const embedder = fromAiSdkEmbeddings(openai.embedding("text-embedding-3-small"));
// #endregion docs
/** @param {import("@geekist/llm-core/adapters").VectorStoreUpsertInput} input */
const readUpsertIds = (input) =>
  "documents" in input
    ? input.documents.map((item) => item.id ?? "new")
    : input.vectors.map((item) => item.id ?? "new");

/** @type {import("@geekist/llm-core/adapters").VectorStore} */
const vectorStore = {
  upsert: (input) => ({ ids: readUpsertIds(input) }),
  delete: () => true,
};

// #region docs
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
