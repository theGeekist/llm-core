// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const loop = recipes.loop().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const input = {
  input: "Summarize this in three steps.",
  maxIterations: 3,
};

const outcome = await loop.run(input);

// #endregion docs
void outcome;
