// #region docs
import { recipes } from "#recipes";
import type { Retriever } from "#adapters";

const retriever: Retriever = {
  retrieve: () => ({ documents: [] }),
};

const wf = recipes.rag().defaults({ adapters: { retriever } }).build();
// #endregion docs

void wf;
