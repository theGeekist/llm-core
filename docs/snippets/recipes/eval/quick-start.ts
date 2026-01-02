// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import type { EvalInput } from "#recipes";

const evaluate = recipes.eval().defaults({
  adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
});

const input: EvalInput = {
  prompt: "Summarize the policy and rate clarity.",
  candidates: 2,
  dataset: { rows: ["Refunds are issued within 30 days."] },
};

const outcome = await evaluate.run(input);

// #endregion docs
void outcome;
