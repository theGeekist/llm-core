// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel, fromLlamaIndexRetriever } from "#adapters";
import { openai } from "@ai-sdk/openai";
import { BaseRetriever } from "@llamaindex/core/retriever";
import type { QueryBundle } from "@llamaindex/core/query-engine";
import { Document } from "@llamaindex/core/schema";

class SimpleRetriever extends BaseRetriever {
  constructor() {
    super();
  }

  async _retrieve(_query: QueryBundle) {
    return [{ node: new Document({ text: "Refunds are issued within 30 days." }), score: 0.9 }];
  }
}

const retriever = new SimpleRetriever();

const rag = recipes.rag();

const input = { input: "What is the refund policy?" };
const outcome = await rag.run(input, {
  adapters: {
    retriever: fromLlamaIndexRetriever(retriever),
    model: fromAiSdkModel(openai("gpt-4o-mini")),
  },
});

// #endregion docs
void outcome;
