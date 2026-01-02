// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import type { EvalConfig } from "#recipes";

const config = {
  candidateCount: 3,
} satisfies EvalConfig;

const evaluate = recipes
  .eval()
  .configure(config)
  .defaults({
    adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
  });

// #endregion docs
void evaluate;
