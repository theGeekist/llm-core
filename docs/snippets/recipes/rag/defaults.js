// #region docs
import { recipes } from "#recipes";
// #endregion docs

/** @type {any} */
const myRetriever = {};
/** @type {any} */
const myModel = {};

// #region docs
const rag = recipes.rag().configure({
  retrieval: {
    defaults: {
      adapters: {
        retriever: myRetriever,
      },
    },
  },
  synthesis: {
    defaults: {
      adapters: {
        model: myModel,
      },
    },
  },
});
// #endregion docs

void rag;
