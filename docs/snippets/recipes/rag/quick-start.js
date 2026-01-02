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

  /** @param {import("@llamaindex/core/query-engine").QueryBundle} _params */
  async _retrieve(_params) {
    return [{ node: new Document({ text: "Refunds are issued within 30 days." }), score: 0.9 }];
  }
}

const retriever = new SimpleRetriever();

const rag = recipes.rag();

const outcome = await rag.run(
  { input: "What is the refund policy?" },
  {
    adapters: {
      retriever: fromLlamaIndexRetriever(retriever),
      model: fromAiSdkModel(openai("gpt-4o-mini")),
    },
  },
);
// #endregion docs

void outcome;
