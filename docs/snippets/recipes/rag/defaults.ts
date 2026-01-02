// #region docs
import { recipes } from "#recipes";
import type { AdapterBundle } from "#adapters";
import type { RagRecipeConfig } from "#recipes";
const myRetriever = {} as AdapterBundle["retriever"];
const myModel = {} as AdapterBundle["model"];

const config = {
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
} satisfies RagRecipeConfig;

const rag = recipes.rag().configure(config);

// #endregion docs
void rag;
