// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel, fromLlamaIndexRetriever } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { BaseRetriever } from "@llamaindex/core/retriever";
import { Document } from "@llamaindex/core/schema";

class SimpleRetriever extends BaseRetriever {
  constructor() {
    super();
  }

  /** @param {any} _query */
  async _retrieve(_query) {
    return [{ node: new Document({ text: "Refunds are issued within 30 days." }), score: 0.9 }];
  }
}

/** @type {any} */
const retriever = new SimpleRetriever();

const rag = recipes.rag().defaults({
  adapters: {
    retriever: fromLlamaIndexRetriever(retriever),
    model: fromAiSdkModel(openai("gpt-4o-mini")),
  },
});
// #endregion docs

void rag;
