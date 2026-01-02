// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import type { LoopInput } from "#recipes";

const loop = recipes.loop().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const input: LoopInput = {
  input: "Summarize this in three steps.",
  maxIterations: 3,
};

const outcome = await loop.run(input);

// #endregion docs
void outcome;
