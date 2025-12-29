import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

// #region docs
const chat = recipes["chat.simple"]({
  system: "You are a helpful coding assistant.",
  model: "gpt-4o-mini",
}).defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
  },
});
// #endregion docs

void chat;
