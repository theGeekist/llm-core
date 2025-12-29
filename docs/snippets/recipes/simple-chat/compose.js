// #region docs
import { recipes } from "#recipes";

const chat = recipes["chat.simple"]({
  system: "You are a helpful coding assistant.",
}).use(recipes.agent());

const outcome = await chat.run({ input: "Explain DSP." });

void outcome;
// #endregion docs
