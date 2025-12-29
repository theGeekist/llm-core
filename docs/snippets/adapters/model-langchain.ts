// #region docs
import { fromLangChainModel } from "#adapters";
import type { Model } from "#adapters";
import { ChatOpenAI } from "@langchain/openai";

const model: Model = fromLangChainModel(
  new ChatOpenAI({
    model: "gpt-4o-mini",
  }),
);
// #endregion docs

void model;
