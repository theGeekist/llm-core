// #region docs
import { Adapter } from "#adapters";

/** @param {import("@geekist/llm-core/adapters").VectorStoreUpsertInput} input */
const readUpsertIds = (input) =>
  "documents" in input ? input.documents.map((doc) => doc.id ?? "new") : [];

/** @param {import("@geekist/llm-core/adapters").VectorStoreDeleteInput} input */
const readDeleteIds = (input) => ("ids" in input ? input.ids : []);

/** @type {import("@geekist/llm-core/adapters").VectorStore} */
const store = {
  upsert: (input) => ({ ids: readUpsertIds(input) }),
  delete: (input) => {
    console.log(readDeleteIds(input));
    return true;
  },
};

const vectorStore = Adapter.vectorStore("custom.vectorStore", store);
// #endregion docs

void vectorStore;
