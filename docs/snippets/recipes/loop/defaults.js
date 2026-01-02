// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const loop = recipes.loop().configure({
  defaults: {
    adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
  },
});

// #endregion docs
void loop;
