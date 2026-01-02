// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const evaluate = recipes.eval().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const outcome = await evaluate.run(
  { prompt: "Score this response.", candidates: 2 },
  { runtime: { diagnostics: "strict" } },
);

console.log(outcome.diagnostics, outcome.trace);
// #endregion docs
