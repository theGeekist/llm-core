// #region docs
import { recipes } from "#recipes";

const chat = recipes["chat.simple"]({
  model: "gpt-4o-mini",
}).use(recipes.agent());

const outcome = await chat.run({ input: "Explain DSP." });

void outcome;
// #endregion docs
