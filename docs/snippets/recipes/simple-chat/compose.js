// #region docs
import { recipes } from "#recipes";

const chat = recipes["chat.simple"]({
  system: "You are a helpful coding assistant.",
  model: "gpt-4o-mini",
}).use(recipes.agent());

const outcome = await chat.run({ input: "Explain DSP." });

// #endregion docs
void outcome;
