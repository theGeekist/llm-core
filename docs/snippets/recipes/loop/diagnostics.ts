// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const loop = recipes.loop().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const outcome = await loop.run(
  { input: "Iterate a plan.", maxIterations: 2 },
  { runtime: { diagnostics: "strict" } },
);

console.log(outcome.diagnostics, outcome.trace);
// #endregion docs
