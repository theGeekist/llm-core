// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const agent = recipes.agent();
const input = { input: "..." };
const fastModel = fromAiSdkModel(openai("gpt-4o-mini"));

await agent.run(input, {
  adapters: {
    model: fastModel,
  },
});
// #endregion docs
