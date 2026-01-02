// #region docs
import { recipes } from "#recipes";
import { fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";
import type { LoopConfig } from "#recipes";

const config = {
  defaults: {
    adapters: { model: fromAiSdkModel(openai("gpt-4o-mini")) },
  },
} satisfies LoopConfig;

const loop = recipes.loop().configure(config);

// #endregion docs
void loop;
