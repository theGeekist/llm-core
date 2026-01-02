// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const evaluate = recipes
  .eval()
  .configure({ candidateCount: 3 })
  .defaults({
    adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
  });

// #endregion docs
void evaluate;
