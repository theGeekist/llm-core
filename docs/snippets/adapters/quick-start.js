// #region docs
import { recipes } from "#recipes";

const retriever = {
  retrieve: () => ({ documents: [] }),
};

const wf = recipes.rag().defaults({ adapters: { retriever } }).build();
// #endregion docs

void wf;
