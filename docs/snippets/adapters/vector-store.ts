// #region docs
import { Adapter } from "#adapters";
import type { VectorStore, VectorStoreDeleteInput, VectorStoreUpsertInput } from "#adapters";

const readUpsertIds = (input: VectorStoreUpsertInput) =>
  "documents" in input ? input.documents.map((doc) => doc.id ?? "new") : [];

const readDeleteIds = (input: VectorStoreDeleteInput) => ("ids" in input ? input.ids : []);

const store: VectorStore = {
  upsert: (input) => ({ ids: readUpsertIds(input) }),
  delete: (input) => {
    console.log(readDeleteIds(input));
    return true;
  },
};

const vectorStore = Adapter.vectorStore("custom.vectorStore", store);
// #endregion docs

void vectorStore;
