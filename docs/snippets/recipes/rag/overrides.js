// #region docs
import { recipes } from "#recipes";

const rag = recipes.rag();
/** @type {import("#adapters/types").Model} */
const fastModel = /** @type {any} */ ({});
/** @type {import("#adapters/types").Retriever} */
const preciseRetriever = /** @type {any} */ ({});

await rag.run(
  { input: "Explain this error" },
  {
    adapters: {
      model: fastModel,
      retriever: preciseRetriever,
    },
  },
);
// #endregion docs
